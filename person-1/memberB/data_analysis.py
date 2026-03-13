"""
Project 1 - Cloud Native Nutritional Insights Application
By SAIF (000969218)

This script:
- Cleans All_Diets.csv
- Calculates averages and ratios
- Identifies top 5 protein recipes per diet
- Generates required visualizations
"""

import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns


def main():
    # --- Paths ---
    base_dir = os.path.dirname(__file__)
    csv_path = os.path.join(base_dir, "data", "All_Diets.csv")
    out_dir = os.path.join(base_dir, "Outputs")
    os.makedirs(out_dir, exist_ok=True)

    print("Reading:", csv_path)

    # Load data
    df = pd.read_csv(csv_path)

    # Clean column names (remove extra spaces)
    df.columns = [c.strip() for c in df.columns]

    print("\nColumns found:")
    print(df.columns.tolist())

    # These columns should exist based on the project instructions
    diet_col = "Diet_type"
    protein_col = "Protein(g)"
    carbs_col = "Carbs(g)"
    fat_col = "Fat(g)"

    # If any required column is missing, stop and show what’s wrong
    required = [diet_col, protein_col, carbs_col, fat_col]
    missing = [c for c in required if c not in df.columns]
    if missing:
        print("\nMissing required columns:", missing)
        print("Fix: your CSV has different names. Copy the columns list above and paste it here.")
        return

    # --- Basic cleaning ---
    # Convert macros to numbers
    for col in [protein_col, carbs_col, fat_col]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Fill missing macro values with the column average
    df[[protein_col, carbs_col, fat_col]] = df[[protein_col, carbs_col, fat_col]].fillna(
        df[[protein_col, carbs_col, fat_col]].mean(numeric_only=True)
    )

    # Optimization: convert Diet_type to category for faster grouping
    df[diet_col] = df[diet_col].astype("category")

    # --- Ratios ---
    # Replace 0 to avoid divide-by-zero
    df["Protein_to_Carbs_ratio"] = df[protein_col] / df[carbs_col].replace(0, np.nan)
    df["Carbs_to_Fat_ratio"] = df[carbs_col] / df[fat_col].replace(0, np.nan)

    # Save cleaned CSV
    cleaned_path = os.path.join(out_dir, "cleaned_All_Diets.csv")
    df.to_csv(cleaned_path, index=False)
    print("\nSaved:", cleaned_path)

    # --- Averages by diet type ---
    macro_cols = [protein_col, carbs_col, fat_col]
    avg_macros = df.groupby(diet_col)[macro_cols].mean()

    avg_path = os.path.join(out_dir, "avg_macros_by_diet.csv")
    avg_macros.to_csv(avg_path)
    print("Saved:", avg_path)

    # --- Diet with highest average protein ---
    highest_diet = avg_macros[protein_col].idxmax()
    highest_val = avg_macros.loc[highest_diet, protein_col]

    highest_txt = os.path.join(out_dir, "diet_highest_avg_protein.txt")
    with open(highest_txt, "w", encoding="utf-8") as f:
        f.write(f"Highest average protein diet: {highest_diet}\n")
        f.write(f"Average protein: {highest_val:.2f} g\n")
    print("Saved:", highest_txt)

    

    # Optimization: use nlargest per group instead of sorting full dataset
    top5 = (
        df.groupby(diet_col, group_keys=False)
        .apply(lambda g: g.nlargest(5, protein_col))
        .copy()
    )

    # reset_index WITHOUT drop 
    top5 = top5.reset_index()

    
    if "level_0" in top5.columns:
        top5 = top5.drop(columns=["level_0"])

    
    if diet_col not in top5.columns:
        first_col = top5.columns[0]
        top5 = top5.rename(columns={first_col: diet_col})

    # Final safety check 
    if diet_col not in top5.columns:
        print("\nERROR: Diet_type is still missing from top5 after fix.")
        print("Top5 columns:", top5.columns.tolist())
        return

    

    top5_path = os.path.join(out_dir, "top5_protein_by_diet.csv")
    top5.to_csv(top5_path, index=False)
    print("Saved:", top5_path)

    # --- Charts ---
    sns.set_theme()

    # 1) Bar chart
    avg_long = avg_macros.reset_index().melt(
        id_vars=diet_col,
        value_vars=macro_cols,
        var_name="Macro",
        value_name="Grams"
    )

    plt.figure(figsize=(12, 6))
    sns.barplot(data=avg_long, x=diet_col, y="Grams", hue="Macro")
    plt.title("Average macronutrients by diet type")
    plt.xticks(rotation=30, ha="right")
    plt.tight_layout()
    bar_path = os.path.join(out_dir, "bar_avg_macros.png")
    plt.savefig(bar_path, dpi=200)
    plt.close()
    print("Saved:", bar_path)

    # 2) Heatmap
    plt.figure(figsize=(10, 6))
    sns.heatmap(avg_macros, annot=True, fmt=".1f", linewidths=0.5)
    plt.title("Heatmap: average macros (g) by diet type")
    plt.tight_layout()
    heat_path = os.path.join(out_dir, "heatmap_macros.png")
    plt.savefig(heat_path, dpi=200)
    plt.close()
    print("Saved:", heat_path)

    # 3) Scatter (top5 protein rows)
    plt.figure(figsize=(12, 6))
    sns.scatterplot(data=top5, x=protein_col, y=carbs_col, hue=diet_col, s=120)
    plt.title("Top 5 protein rows per diet (protein vs carbs)")
    plt.tight_layout()
    scatter_path = os.path.join(out_dir, "scatter_top5_protein.png")
    plt.savefig(scatter_path, dpi=200)
    plt.close()
    print("Saved:", scatter_path)

    print("\nDone. Open Outputs/ to see results.")


if __name__ == "__main__":
    main()
