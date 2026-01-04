from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Привет от GatherVibe API!"}

@app.get("/health")
def health_check():
    print("что-то случилось")
    return {"status": "ok", "service": "gathervibe-backend"}