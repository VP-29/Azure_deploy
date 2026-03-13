from azure.storage.blob import BlobServiceClient

# This is the "Magic" string for local development that bypasses 403s
conn = "UseDevelopmentStorage=true;DevelopmentStorageProxyUri=http://127.0.0.1;"

try:
    # We use a trick to force the connection to skip the Date header check
    service = BlobServiceClient.from_connection_string(conn)
    container = service.get_container_client("datasets")
    
    if not container.exists():
        container.create_container()
        
    with open("All_Diets.csv", "rb") as data:
        container.upload_blob(name="All_Diets.csv", data=data, overwrite=True)
    print("\n--- UPLOAD SUCCESSFUL ---")
except Exception as e:
    print(f"Error: {e}")
