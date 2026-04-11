import azure.functions as func
import json
import pandas as pd
import os
from azure.storage.blob import BlobServiceClient
import io
import time
import math
import traceback

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

CONNECTION_STRING = os.environ.get("AzureWebJobsStorage")
INPUT_CONTAINER = "datasets"
INPUT_BLOB = "All_Diets.csv"
OUTPUT_CONTAINER = "processed"
CLEANED_BLOB = "Cleaned_Diets.csv"
CACHE_BLOB = "dashboard_cache.json"


def get_blob_service():
    return BlobServiceClient.from_connection_string(CONNECTION_STRING)


@app.blob_trigger(
    arg_name="myblob",
    path=f"{INPUT_CONTAINER}/{INPUT_BLOB}",
    connection="AzureWebJobsStorage",
)
def clean_and_precompute(myblob: func.InputStream):
    try:
        start_time = time.time()

        df = pd.read_csv(io.BytesIO(myblob.read()))
        df.columns = df.columns.str.strip()

        required_columns = ["Diet_type", "Recipe_name", "Cuisine_type"]
        missing_required = [col for col in required_columns if col not in df.columns]
        if missing_required:
            raise ValueError(f"Missing required columns: {missing_required}")

        df = df.dropna(subset=required_columns)

        cols_to_clean = ["Protein(g)", "Carbs(g)", "Fat(g)"]
        for col in cols_to_clean:
            if col in df.columns:
                df[col] = (
                    df[col]
                    .astype(str)
                    .str.replace(",", "", regex=False)
                    .str.extract(r"([-+]?\d*\.?\d+)")[0]
                )
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
            else:
                df[col] = 0

        df["Diet_type"] = df["Diet_type"].astype(str).str.strip()
        df["Recipe_name"] = df["Recipe_name"].astype(str).str.strip()
        df["Cuisine_type"] = df["Cuisine_type"].astype(str).str.strip()

        blob_service_client = get_blob_service()
        container_client = blob_service_client.get_container_client(OUTPUT_CONTAINER)

        if not container_client.exists():
            container_client.create_container()

        cleaned_csv_data = df.to_csv(index=False)
        blob_service_client.get_blob_client(
            container=OUTPUT_CONTAINER,
            blob=CLEANED_BLOB
        ).upload_blob(cleaned_csv_data, overwrite=True)

        averages_raw = df.groupby("Diet_type")[["Protein(g)", "Carbs(g)", "Fat(g)"]].mean()

        averages = {
            str(diet): {
                "Protein(g)": float(values["Protein(g)"]),
                "Carbs(g)": float(values["Carbs(g)"]),
                "Fat(g)": float(values["Fat(g)"]),
            }
            for diet, values in averages_raw.to_dict("index").items()
        }

        recipe_distribution_raw = df["Diet_type"].value_counts().to_dict()
        recipe_distribution = {
            str(k): int(v) for k, v in recipe_distribution_raw.items()
        }

        top_recipes_raw = df.sort_values(
            by="Protein(g)", ascending=False
        ).head(10)[["Recipe_name", "Diet_type", "Protein(g)"]].to_dict("records")

        top_recipes = [
            {
                "Recipe_name": str(row.get("Recipe_name", "")),
                "Diet_type": str(row.get("Diet_type", "")),
                "Protein(g)": float(row.get("Protein(g)", 0)),
            }
            for row in top_recipes_raw
        ]

        cache_data = {
            "last_updated": time.strftime("%Y-%m-%d %H:%M:%S"),
            "execution_time_sec": float(round(time.time() - start_time, 4)),
            "analysis": {
                "averages_by_diet": averages,
                "recipe_distribution": recipe_distribution,
                "top_recipes": top_recipes,
            },
        }

        blob_service_client.get_blob_client(
            container=OUTPUT_CONTAINER,
            blob=CACHE_BLOB
        ).upload_blob(json.dumps(cache_data), overwrite=True)

        print(f"Success: Processed {INPUT_BLOB} and updated cache.")
        print("Cache JSON successfully created.")

    except Exception as e:
        print(f"Error in clean_and_precompute: {str(e)}")
        print(traceback.format_exc())


@app.route(route="get_dashboard_data", methods=["GET"])
def get_dashboard_data(req: func.HttpRequest) -> func.HttpResponse:
    try:
        blob_service_client = get_blob_service()
        blob_client = blob_service_client.get_blob_client(
            container=OUTPUT_CONTAINER,
            blob=CACHE_BLOB
        )

        if not blob_client.exists():
            return func.HttpResponse(
                json.dumps({"error": "Cache not ready. Upload dataset first."}),
                status_code=404,
                mimetype="application/json",
            )

        cache_content = blob_client.download_blob().readall()
        return func.HttpResponse(cache_content, mimetype="application/json")

    except Exception as e:
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            status_code=500,
            mimetype="application/json",
        )


@app.route(route="search_recipes", methods=["GET"])
def search_recipes(req: func.HttpRequest) -> func.HttpResponse:
    try:
        query = req.params.get("q", "").lower().strip()
        diet_filter = req.params.get("diet", "").lower().strip()
        page = int(req.params.get("page", 1))
        limit = int(req.params.get("limit", 10))

        if page < 1:
            page = 1
        if limit < 1:
            limit = 10

        blob_service_client = get_blob_service()
        blob_client = blob_service_client.get_blob_client(
            container=OUTPUT_CONTAINER,
            blob=CLEANED_BLOB
        )

        if not blob_client.exists():
            return func.HttpResponse(
                json.dumps({"error": "No data available."}),
                status_code=404,
                mimetype="application/json",
            )

        csv_content = blob_client.download_blob().readall()
        df = pd.read_csv(io.BytesIO(csv_content))

        df["Diet_type"] = df["Diet_type"].astype(str)
        df["Recipe_name"] = df["Recipe_name"].astype(str)
        df["Cuisine_type"] = df["Cuisine_type"].astype(str)

        if diet_filter and diet_filter != "all":
            df = df[
                df["Diet_type"]
                .astype(str)
                .str.strip()
                .str.lower() == diet_filter
            ]

        if query:
            df = df[
                df["Recipe_name"].astype(str).str.lower().str.contains(query, na=False)
                | df["Cuisine_type"].astype(str).str.lower().str.contains(query, na=False)
                | df["Diet_type"].astype(str).str.lower().str.contains(query, na=False)
            ]

        total_items = len(df)
        total_pages = max(1, math.ceil(total_items / limit))
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit

        results_raw = df.iloc[start_idx:end_idx].to_dict("records")

        results = []
        for row in results_raw:
            results.append({
                "Recipe_name": str(row.get("Recipe_name", "")),
                "Diet_type": str(row.get("Diet_type", "")),
                "Cuisine_type": str(row.get("Cuisine_type", "")),
                "Protein(g)": None if pd.isna(row.get("Protein(g)")) else float(row.get("Protein(g)", 0)),
                "Carbs(g)": None if pd.isna(row.get("Carbs(g)")) else float(row.get("Carbs(g)", 0)),
                "Fat(g)": None if pd.isna(row.get("Fat(g)")) else float(row.get("Fat(g)", 0)),
            })

        response_data = {
            "results": results,
            "pagination": {
                "current_page": int(page),
                "total_pages": int(total_pages),
                "total_items": int(total_items),
                "limit": int(limit),
            },
        }

        return func.HttpResponse(
            json.dumps(response_data),
            mimetype="application/json",
        )

    except Exception as e:
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            status_code=500,
            mimetype="application/json",
        )