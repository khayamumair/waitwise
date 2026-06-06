"""
ingest.py — run once before anything else.
Loads all CSVs into DuckDB and embeds RAG docs into ChromaDB.
"""

import duckdb
import chromadb
from chromadb.utils import embedding_functions
import pandas as pd
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
DB_PATH = str(Path(__file__).parent / "db" / "waitwise.db")
VECTOR_PATH = str(Path(__file__).parent / "vector_store")


def load_duckdb():
    con = duckdb.connect(DB_PATH)

    # Load each CSV as a persistent table
    tables = {
        "patients":            "patients.csv",
        "contact_history":     "contact_history.csv",
        "coordinators":        "coordinators.csv",
        "borough_deprivation": "borough_deprivation.csv",
        "rag_knowledge_base":  "rag_knowledge_base.csv",
        "waiting_list_status": "waiting_list_status.csv",
        "referrals":           "referrals.csv",
        "pathway_events":      "pathway_events.csv",
        "coordinator_actions": "coordinator_actions.csv",
        "lookup_conditions":   "lookup_conditions.csv",
        "lookup_languages":    "lookup_languages.csv",
        "lookup_referral_types": "lookup_referral_types.csv",
        # These start empty — pipeline writes to them
        "triage_results":      "triage_results.csv",
        "scan_runs":           "scan_runs.csv",
        "communications":      "communications.csv",
        "agent_events":        "agent_events.csv",
    }

    for table, filename in tables.items():
        path = DATA_DIR / filename
        # Drop and recreate so re-running ingest is safe
        con.execute(f"DROP TABLE IF EXISTS {table}")
        con.execute(f"CREATE TABLE {table} AS SELECT * FROM read_csv_auto('{path}')")
        count = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {count} rows loaded")

    con.close()


def load_chromadb():
    client = chromadb.PersistentClient(path=VECTOR_PATH)

    # Use a local sentence-transformer model for embeddings (no API key needed)
    ef = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name="all-MiniLM-L6-v2"
    )

    # --- RAG knowledge base ---
    # Each row = one NHS/WaitWise rule. We embed the title + key_rule text.
    collection = client.get_or_create_collection("rag_knowledge_base", embedding_function=ef)
    df = pd.read_csv(DATA_DIR / "rag_knowledge_base.csv")

    collection.upsert(
        ids=df["doc_id"].tolist(),
        documents=(df["title"] + ". " + df["content_summary"]).tolist(),
        metadatas=df[["category", "source"]].to_dict("records"),
    )
    print(f"  rag_knowledge_base: {len(df)} docs embedded")

    # --- Borough deprivation ---
    # Embedded so Triage can retrieve deprivation context by borough name
    bw_collection = client.get_or_create_collection("borough_deprivation", embedding_function=ef)
    bdf = pd.read_csv(DATA_DIR / "borough_deprivation.csv")

    bw_collection.upsert(
        ids=bdf["borough"].tolist(),
        documents=(
            "Borough: " + bdf["borough"] +
            ". IMD quintile: " + bdf["imd_avg_quintile"].astype(str) +
            ". Economic inactivity: " + bdf["economic_inactivity_pct"].astype(str) + "%."
        ).tolist(),
        metadatas=bdf[["imd_avg_quintile", "life_satisfaction_score", "anxiety_score", "economic_inactivity_pct"]].to_dict("records"),
    )
    print(f"  borough_deprivation: {len(bdf)} docs embedded")


if __name__ == "__main__":
    print("Loading DuckDB...")
    load_duckdb()
    print("Loading ChromaDB...")
    load_chromadb()
    print("Ingest complete.")
