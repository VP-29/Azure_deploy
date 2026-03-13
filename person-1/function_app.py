import azure.functions as func
import json
import pandas as pd
import os
from azure.storage.blob import BlobServiceClient
import io
import time

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

@app.route(route="analyze_diet")
def analyze_diet(req: func.HttpRequest) -> func.HttpResponse:
    start_time = time.time()
    
    # 1. Configuration (In Azure, use Environment Variables/App Settings)
    connection_string = os.environ.get("AzureWebJobsStorage") 
    container_name = "datasets"
    blob_name = "All_Diets.csv"

    try:
        # 2. Download from Blob Storage
        blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)
        
        stream = blob_client.download_blob().readall()
        df = pd.read_csv(io.BytesIO(stream))
        
        # 3. Data Cleaning
        df.columns = df.columns.str.strip()
        cols_to_avg = ['Protein(g)', 'Carbs(g)', 'Fat(g)']
        
        # Ensure numeric conversion
        for col in cols_to_avg:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        
        # 4. Analysis
        # Averages by Diet Type
        averages = df.groupby('Diet_type')[cols_to_avg].mean().to_dict('index')
        
        # Top Protein Diet
        highest_diet = df.groupby('Diet_type')['Protein(g)'].mean().idxmax()
        
        end_time = time.time()
        execution_time = round(end_time - start_time, 4)

        # 5. Build Response JSON
        result = {
            "metadata": {
                "execution_time_sec": execution_time,
                "dataset": blob_name,
                "status": "success"
            },
            "analysis": {
                "averages_by_diet": averages,
                "highest_protein_diet": highest_diet
            }
        }

        return func.HttpResponse(
            json.dumps(result),
            mimetype="application/json",
            status_code=200
        )

    except Exception as e:
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500
        )
