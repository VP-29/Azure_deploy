# Project 1 - Cloud-Native Nutritional Insights (SAIF, 000969218)

This folder contains the data analysis script for Project 1.

## What it does
- Loads `All_Diets.csv`
- Cleans missing values
- Calculates average macros by diet type
- Finds the diet with the highest average protein
- Extracts top 5 protein rows per diet type
- Saves charts (bar chart, heatmap, scatter)

## How to run locally
1. Install dependencies:
   pip install -r requirements.txt

2. Run the script:
   python data_analysis.py

## Files
- `data_analysis.py` - main script
- `requirements.txt` - Python dependencies
- `data/All_Diets.csv` - dataset input
