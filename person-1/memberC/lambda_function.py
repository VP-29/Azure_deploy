import os
import json
import pandas as pd
from azure.storage.blob import BlobServiceClient

connection_string = "UseDevelopmentStorage=true;DevelopmentStorageProxyUri=http://127.0.0.1;"
container_name = "datasets"
blob_name = "All_Diets.csv"
output_dir = "simulated_nosql"

def main():
    try:
        blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)
        
        print(f"Connecting to Azurite and downloading {blob_name}...")
        with open("temp_data.csv", "wb") as f:
            f.write(blob_client.download_blob().readall())

        print("Processing nutritional data...")
        df = pd.read_csv("temp_data.csv")
        df.columns = df.columns.str.strip()
        
        # UPDATED: Only using the columns actually present in your file
        cols_to_avg = ['Protein(g)', 'Carbs(g)', 'Fat(g)']
        
        # Group by Diet_type and calculate averages
        averages = df.groupby('Diet_type')[cols_to_avg].mean().to_dict('index')

        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
        
        output_file = f"{output_dir}/results.json"
        with open(output_file, "w") as f:
            json.dump(averages, f, indent=4)

        print(f"\n--- SUCCESS: Results saved to {output_file} ---")
        
        if os.path.exists("temp_data.csv"):
            os.remove("temp_data.csv")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
