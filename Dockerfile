FROM python:3.11-slim

WORKDIR /app

COPY public ./public
COPY server.py .

EXPOSE 8090

CMD ["python", "server.py"]
