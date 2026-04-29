# IOPaint sidecar — runs LaMa locally for outline removal in preserve-mode catalog generation.
# CPU-only build; switch --device=cuda and the torch index URL for GPU.
FROM python:3.10-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
        torch torchvision \
        --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir iopaint

# IOPaint downloads model weights on first request; mount /root/.cache to persist.
EXPOSE 8080

CMD ["iopaint", "start", \
     "--model=lama", \
     "--device=cpu", \
     "--port=8080", \
     "--host=0.0.0.0"]
