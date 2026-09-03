#!/usr/bin/env bash
set -e
pip install -r requirements.txt
python app/ml/download_dataset.py
python app/ml/train_text_classifier.py
python app/ml/train_transaction_model.py
