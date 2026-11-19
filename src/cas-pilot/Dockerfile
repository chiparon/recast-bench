FROM python:3.12-slim
COPY . /wheels
RUN pip install --no-index /wheels/*.whl && rm -rf /wheels
