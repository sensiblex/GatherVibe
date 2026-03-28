FROM python:3.11-slim

WORKDIR /app

# Install only the packages needed for the project
COPY requirements_docker.txt .
RUN pip install --no-cache-dir -r requirements_docker.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:socket_app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
