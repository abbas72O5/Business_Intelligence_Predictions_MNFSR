# Ministry BI & Analytics

A comprehensive Business Intelligence and Analytics platform designed for ministry departments to securely manage, analyze, and forecast project development portfolios.

## Features Implemented So Far

- **Secure Departmental Access (Authentication & RBAC):**
  - Robust JWT-based authentication via FastAPI and MongoDB.
  - Role-Based Access Control (Super Admin, Admin, User) with permissions strictly siloed by Department.
  - New users are placed in a "Pending" state until verified by their respective Department Admin.
  - Modern, responsive React login/registration portal featuring a 70% dark green branding split.

- **Project Data Ingestion:**
  - Drag-and-drop UI component (`react-dropzone`) for uploading project sheets.
  - Advanced Pandas processing that handles `.csv` and splits multi-sheet `.xlsx` files into isolated datasets.
  - Automated extraction of column schema metadata (Integer, Float, Date, String).
  - High-performance conversion of raw data into analytical `.parquet` files stored locally for future DuckDB querying.
  - Interactive "File Library" sidebar featuring a live 5-row table preview of uploaded datasets.

- **Dashboard Architecture:**
  - Scalable nested routing with a persistent, collapsible sidebar navigation layout.
  - Placeholder scaffolding for upcoming advanced features: 
    - **Data Selection** (React Flow canvas)
    - **Observations** (Plotly.js visual charts)
    - **Predictions** (Meta Prophet AI forecasting)

- **Hybrid Database Architecture & Data Selection:**
  - **Metadata & Relationship Layer (MongoDB):** Acts as the central map tracking table schemas and complex user-defined relationships (Joins, Cardinality) across uploaded files.
  - **Analytical Engine (DuckDB + Parquet):** Leverages DuckDB to dynamically execute SQL joins against highly efficient local Parquet datasets.
  - **Interactive Data Canvas:** Utilizes React Flow to allow users to visually drag-and-drop tables, draw persistent relationship lines (e.g., INNER/LEFT joins), and selectively cherry-pick columns.
  - **Automated Query Generation:** The backend seamlessly translates visual canvas relationships into raw SQL queries, generating new composite datasets instantly without exposing users to SQL complexity.
