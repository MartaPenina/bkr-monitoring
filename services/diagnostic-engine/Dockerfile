FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY engine.py .
COPY prompt_templates/ prompt_templates/
EXPOSE 8090
CMD ["python", "engine.py"]
