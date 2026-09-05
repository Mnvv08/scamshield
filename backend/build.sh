#!/usr/bin/env bash
set -e

# Trained models and datasets are committed to the repo, so a deploy only needs
# to install dependencies. Training on every deploy was slow (12-16 min) and
# fragile: it depended on two third-party dataset mirrors staying online and hit
# free-tier memory limits during scikit-learn training.
#
# To update the models, retrain locally and commit the new artifacts:
#   python app/ml/download_dataset.py
#   python app/ml/train_text_classifier.py
#   python app/ml/train_transaction_model.py
pip install -r requirements.txt
