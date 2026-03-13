import pytest 
from pathlib import Path
import shutil
from memberA import data_analysis

def test_main_creates_outputs():
    base_dir = Path(__file__).parent.parent / "memberA"
    outputs_dir = base_dir / "Outputs"
    
    if outputs_dir.exists():
        shutil.rmtree(outputs_dir)
        
    data_analysis.main()
    
    assert outputs_dir.exists()
    assert (outputs_dir / "cleaned_All_Diets.csv").exists()
    assert (outputs_dir / "top5_protein_by_diet.csv").exists()
    assert (outputs_dir / "bar_avg_macros.png").exists()
    assert (outputs_dir / "heatmap_macros.png").exists()
    assert (outputs_dir / "scatter_top5_protein.png").exists()
