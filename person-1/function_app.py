import azure.functions as func
import json
import pandas as pd
import os
from azure.storage.blob import BlobServiceClient
import io
import time
import math

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# --- CONFIGURATION (Load from environment variables) ---
CONNECTION_STRING = os.environ.get("AzureWebJobsStorage")
INPUT_CONTAINER = "datasets"
INPUT_BLOB = "All_Diets.csv"
OUTPUT_CONTAINER = "processed"
CLEANED_BLOB = "Cleaned_Diets.csv"
CACHE_BLOB = "dashboard_cache.json"

# --- HELPER: Get Blob Service Client ---
def get_blob_service():
    return BlobServiceClient.from_connection_string(CONNECTION_STRING)

# --- 1. PERFORMANCE: BLOB TRIGGER (Data Cleaning & Precomputation) ---
@app.blob_trigger(arg_name="myblob", path=f"{INPUT_CONTAINER}/{INPUT_BLOB}", connection="AzureWebJobsStorage")
def clean_and_precompute(myblob: func.InputStream):
    """
    Triggered when All_Diets.csv is updated.
    Cleans data, saves a processed CSV, and precomputes results for the dashboard.
    """
    try:
        start_time = time.time()
        
        # 1. Read the input blob
        df = pd.read_csv(io.BytesIO(myblob.read()))
        
        # 2. Data Cleaning
        df.columns = df.columns.str.strip()
        # Drop duplicates and rows with missing critical info
        df = df.dropna(subset=['Diet_type', 'Recipe_name', 'Cuisine_type'])
        
        # Numeric conversion for nutritional info
        cols_to_clean = ['Protein(g)', 'Carbs(g)', 'Fat(g)', 'Calories']
        for col in cols_to_clean:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
        
        # 3. Save Cleaned Dataset to Blob Storage (Performance: Data Interaction API uses this)
        blob_service_client = get_blob_service()
        container_client = blob_service_client.get_container_client(OUTPUT_CONTAINER)
        if not container_client.exists():
            container_client.create_container()
            
        cleaned_csv_data = df.to_csv(index=False)
        blob_service_client.get_blob_client(container=OUTPUT_CONTAINER, blob=CLEANED_BLOB).upload_blob(cleaned_csv_data, overwrite=True)
        
        # 4. PRECOMPUTATION (Performance: Calculation done only once on change)
        averages = df.groupby('Diet_type')[['Protein(g)', 'Carbs(g)', 'Fat(g)', 'Calories']].mean().to_dict('index')
        recipe_distribution = df['Diet_type'].value_counts().to_dict()
        
        # Precompute top recipes for quick display
        top_recipes = df.sort_values(by='Protein(g)', ascending=False).head(10)[['Recipe_name', 'Diet_type', 'Protein(g)']].to_dict('records')

        # 5. Build and Save Cache JSON (Can be moved to CosmosDB/Redis in production)
        cache_data = {
            "last_updated": time.strftime("%Y-%m-%d %H:%M:%S"),
            "execution_time_sec": round(time.time() - start_time, 4),
            "analysis": {
                "averages_by_diet": averages,
                "recipe_distribution": recipe_distribution,
                "top_recipes": top_recipes
            }
        }
        
        blob_service_client.get_blob_client(container=OUTPUT_CONTAINER, blob=CACHE_BLOB).upload_blob(json.dumps(cache_data), overwrite=True)
        print(f"Success: Processed {INPUT_BLOB} and updated cache.")

    except Exception as e:
        print(f"Error in clean_and_precompute: {str(e)}")


# --- 2. PERFORMANCE: FAST DASHBOARD DATA API (Read from Cache) ---
@app.route(route="get_dashboard_data", methods=["GET"])
def get_dashboard_data(req: func.HttpRequest) -> func.HttpResponse:
    """
    Returns precomputed dashboard stats. Fast because no calculations are done on-request.
    """
    try:
        blob_service_client = get_blob_service()
        blob_client = blob_service_client.get_blob_client(container=OUTPUT_CONTAINER, blob=CACHE_BLOB)
        
        if not blob_client.exists():
            return func.HttpResponse(json.dumps({"error": "Cache not ready. Upload dataset first."}), status_code=404, mimetype="application/json")
            
        cache_content = blob_client.download_blob().readall()
        data = json.loads(cache_content)
        
        # Add diet list for the frontend filter
        if "analysis" in data and "averages_by_diet" in data["analysis"]:
            data["diets"] = sorted(list(data["analysis"]["averages_by_diet"].keys()))
            
        return func.HttpResponse(json.dumps(data), mimetype="application/json")

    except Exception as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, mimetype="application/json")


# --- 3. DATA INTERACTION: SEARCH, FILTER & PAGINATION ---
@app.route(route="search_recipes", methods=["GET"])
def search_recipes(req: func.HttpRequest) -> func.HttpResponse:
    """
    Allows user to interact with the dataset by searching keywords, 
    filtering by diet, and using pagination.
    """
    try:
        # 1. Read params
        query = req.params.get('q', '').lower()
        diet_filter = req.params.get('diet', '').lower()
        page = int(req.params.get('page', 1))
        limit = int(req.params.get('limit', 10))

        # 2. Get the cleaned data
        blob_service_client = get_blob_service()
        blob_client = blob_service_client.get_blob_client(container=OUTPUT_CONTAINER, blob=CLEANED_BLOB)
        
        if not blob_client.exists():
            return func.HttpResponse(json.dumps({"error": "No data available."}), status_code=404, mimetype="application/json")

        csv_content = blob_client.download_blob().readall()
        df = pd.read_csv(io.BytesIO(csv_content))

        # 3. Apply Filters
        if diet_filter and diet_filter.lower() != 'all':
            df = df[df['Diet_type'].str.lower() == diet_filter]
        
        if query:
            df = df[df['Recipe_name'].str.lower().str.contains(query) | df['Cuisine_type'].str.lower().str.contains(query)]

        # 4. Pagination
        total_items = len(df)
        total_pages = math.ceil(total_items / limit)
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        
        # Clean results for JSON (handle NaN)
        results = df.iloc[start_idx:end_idx].fillna('').to_dict('records')

        response_data = {
            "results": results,
            "pagination": {
                "current_page": page,
                "total_pages": total_pages,
                "total_items": total_items,
                "limit": limit
            }
        }
        
        return func.HttpResponse(json.dumps(response_data), mimetype="application/json")

    except Exception as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, mimetype="application/json")


# --- 4. DATA SCIENCE: CLUSTERING (Diet Profiling) ---
@app.route(route="get_clusters", methods=["GET"])
def get_clusters(req: func.HttpRequest) -> func.HttpResponse:
    """
    Groups diet types into clusters (e.g., High Protein, Low Carb, Balanced) 
    based on their nutritional profiles.
    """
    try:
        blob_service_client = get_blob_service()
        blob_client = blob_service_client.get_blob_client(container=OUTPUT_CONTAINER, blob=CACHE_BLOB)
        
        if not blob_client.exists():
            return func.HttpResponse(json.dumps({"error": "No data available."}), status_code=404, mimetype="application/json")

        cache_content = blob_client.download_blob().readall()
        cache_data = json.loads(cache_content)
        averages = cache_data['analysis']['averages_by_diet']
        
        clusters = {
            "High Protein / Low Carb": [],
            "High Carb / Low Fat": [],
            "Balanced / Moderate": [],
            "Other Profiles": []
        }
        
        for diet, stats in averages.items():
            protein = stats.get('Protein(g)', 0)
            carbs = stats.get('Carbs(g)', 0)
            fat = stats.get('Fat(g)', 0)
            
            if protein > 90 and carbs < 80:
                clusters["High Protein / Low Carb"].append(diet)
            elif carbs > 180 and fat < 110:
                clusters["High Carb / Low Fat"].append(diet)
            elif 70 < protein < 110 and 120 < carbs < 170:
                clusters["Balanced / Moderate"].append(diet)
            else:
                clusters["Other Profiles"].append(diet)
                
        return func.HttpResponse(json.dumps({"clusters": clusters}), mimetype="application/json")

    except Exception as e:
        return func.HttpResponse(json.dumps({"error": str(e)}), status_code=500, mimetype="application/json")
