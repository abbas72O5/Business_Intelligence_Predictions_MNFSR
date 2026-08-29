import asyncio
import sys
import os
import duckdb
import pandas as pd

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import db

def map_dtype_to_string(dtype):
    dtype_str = str(dtype).lower()
    if 'int' in dtype_str:
        return 'Integer'
    elif 'float' in dtype_str:
        return 'Float'
    elif 'datetime' in dtype_str or 'date' in dtype_str:
        return 'Date'
    elif 'bool' in dtype_str:
        return 'Boolean'
    else:
        return 'String'

async def backfill():
    print("Starting backfill process...")
    cursor = db.table_metadata.find({})
    async for table_doc in cursor:
        try:
            storage_path = table_doc.get("storage_path")
            if not storage_path or not os.path.exists(storage_path):
                print(f"Skipping {table_doc.get('filename')} (Path missing or invalid: {storage_path})")
                continue

            print(f"Processing {table_doc['filename']}...")
            df = duckdb.query(f"SELECT * FROM '{storage_path}'").df()
            
            row_count = len(df)
            columns_meta = []
            for col, dtype in df.dtypes.items():
                unique_count = df[col].nunique(dropna=True)
                try:
                    min_val = df[col].min() if not df[col].isnull().all() else None
                    max_val = df[col].max() if not df[col].isnull().all() else None
                    if min_val is not None and max_val is not None:
                        if 'datetime' in str(dtype):
                            min_val = min_val.isoformat() if hasattr(min_val, 'isoformat') else str(min_val)
                            max_val = max_val.isoformat() if hasattr(max_val, 'isoformat') else str(max_val)
                        else:
                            min_val = min_val.item() if hasattr(min_val, 'item') else min_val
                            max_val = max_val.item() if hasattr(max_val, 'item') else max_val
                except Exception:
                    min_val = None
                    max_val = None

                columns_meta.append({
                    "name": str(col), 
                    "type": map_dtype_to_string(dtype),
                    "unique_count": int(unique_count),
                    "min_val": min_val,
                    "max_val": max_val
                })
                
            await db.table_metadata.update_one(
                {"_id": table_doc["_id"]},
                {"$set": {"row_count": row_count, "columns": columns_meta}}
            )
            print(f"Success for {table_doc['filename']}")
            
        except Exception as e:
            print(f"Error processing {table_doc.get('filename')}: {e}")

    print("Backfill complete.")

if __name__ == "__main__":
    asyncio.run(backfill())
