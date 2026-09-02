# Ministry BI & Analytics

A comprehensive Business Intelligence and Analytics platform designed for ministry departments to securely manage, analyze, and forecast project development portfolios.

## Setup & Deployment Instructions

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- MongoDB (running locally or via Atlas)

### 1. Backend Setup
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   ```
3. Install the Python dependencies:
   ```bash
   pip install -r ../requirements.txt
   ```
4. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   *(Note: The server will automatically seed the default departments on the first run)*

### 2. Frontend Setup
1. Open a new terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install the Node.js dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```

### 3. Usage
Once both servers are running:
1. Open your browser and navigate to `http://localhost:5173`
2. Register a new Superadmin account to gain full access to the system.

---

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

- **Advanced Query Engine & Data Modeling:**
  - **Logical Relationships:** Ability to save complex multi-table joins as reusable logical "Relationships", reducing storage redundancy and preserving modeling context.
  - **Dynamic Subquery Execution:** The DuckDB engine seamlessly handles querying logical models, wrapping complex base join structures into subqueries for real-time dataset aggregations on the fly.
  - **Robust Type Casting:** Implemented native `TRY_CAST` logic within DuckDB projections for seamless axis data-type casting (e.g., forcing strings to integers) without crashing the server on dirty or empty data.

- **Multi-Chart Observation Dashboard:**
  - **Dynamic Visual Grid:** Upgraded the legacy single-chart view into an unrestricted, multi-chart canvas allowing simultaneous side-by-side data visualization widgets.
  - **Interactive Resizing:** Highly interactive UI where individual chart widgets can be dynamically resized by dragging their bottom-right handles to fit custom grid layouts.
  - **Slide-out Properties Panel:** Professional BI experience with a resizable, contextual side-panel that slides out on the right to handle granular dataset, axis, and grouping configurations for the currently selected widget.
  - **Premium Plotly Overhauls:** Completely native overriding of Plotly default styles to inject a modern horizontal ModeBar with clean white backgrounds and system-matching green icons.
  - **Full Dashboard Export:** One-click layout export capabilities allowing users to snapshot their entire multi-chart canvas into high-resolution PNG, JPEG, or PDF formats using `html-to-image` and `jsPDF`.

- **Geospatial Mapping Engine (Folium + DuckDB):**
  - **Leaflet.js Integration:** Replaced Plotly's WebGL map engine with Python's Folium to generate lightweight, native HTML Leaflet.js maps directly on the backend, entirely eliminating client-side WebGL canvas crashes.
  - **Bubble & Heat Maps:** Advanced spatial visualization modules allowing dynamic plotting of geographical coordinates (Bubble Maps) or aggregating overlapping data into spatial density layers (Heat Maps).
  - **Secure Iframe Sandbox:** The React frontend seamlessly ingests the generated HTML map payload and isolates it within a sandboxed `iframe`, ensuring perfect integration within the resizable dashboard layout without breaking React's lifecycle.

- **Multi-Tenant Data Siloing:**
  - **Owner-Based Isolation:** Implemented strict query filtering across the backend where file metadata, analytical models, and datasets are isolated directly by the `uploaded_by` or `created_by` user identifier.
  - **Departmental Boundaries:** Ensures users can only query, visualize, and construct predictive relationships on data explicitly owned by or shared within their verified administrative boundary.

- **Advanced Predictive Analytics (Machine Learning):**
  - **Hybrid Modeling Engine:** Integrated Meta's `prophet` library for highly accurate time-series forecasting (with seasonality and confidence intervals) and `scikit-learn` for lightning-fast Linear Regression on numeric distributions.
  - **Drag-and-Drop Forecasting:** Built a dedicated Predictions workspace where users can drag their pre-configured visuals out of a "Bin", drop them onto a resizable forecasting canvas, and run future projections with a single click.
  - **Universal "Snapshot" Projections:** Groundbreaking capability to forecast non-timeline structural charts (like Geographic Maps or Categorical Bar Charts). The backend automatically isolates historical data into hundreds of parallel groupings, trains independent models for every unique category/coordinate, and reconstructs a "Future Snapshot" of the original visual layout.
  - **Native Visual Stitching:** Intelligently maps forecasted trajectory outputs back into the original chart configurations, appending future bars or scatter points directly onto the historical visualizations with distinct color coding (e.g., historical green vs predicted orange).
  - **Session Persistence:** Built-in `localStorage` synchronization that ensures users never lose complex prediction workspace configurations when swapping tabs or reloading the application.

- **Polished UX & Visualization Improvements:**
  - **Axis Grouping Flexibility:** Support for grouping data aggressively by either X or Y axis depending on chart type, applying user-selected SQL aggregation functions (`SUM`, `AVG`, `COUNT`), and dynamically generating appropriate axis titles like `SUM(Students)`.
  - **Responsive Plotly Overhauls:** Engineered Plotly to utilize reactive `automargin` mechanics, completely resolving layout overlapping issues by dynamically adjusting chart bounding boxes based on the length and rotation of data labels.
  - **Fluid Widget Refinements:** Streamlined UI elements such as decreasing oversized button fonts to maintain single-line horizontal layouts, and converting native browser alerts to custom UI-matching modal dialogs for a cohesive aesthetic.

- **Persistent Workspaces & Dashboard Management:**
  - **Save/Load Capabilities:** Enabled robust state preservation across the platform. Users can now save, update, and load entire Data Selection logical models, Observation Dashboards, and Prediction Layouts via dedicated backend endpoints (`PUT`/`POST`). 
  - **Live Canvas Reconstruction:** Loading a saved artifact seamlessly reconstructs the visual react-flow nodes, relationship edges, and chart configurations exactly as they were left.

- **Enhanced Forecasting Boundaries & Rendering:**
  - **Negative Bounds Clamping:** Upgraded the prediction engine with an "Allow Negative Values" configuration toggle. By default, linear regression and Prophet algorithms forcefully clamp forecast values (and confidence intervals) at zero to prevent mathematically accurate but logically impossible projections (like negative revenue).
  - **Seamless Forecasting Traces:** Refined the Plotly data mapping to perfectly stitch the forecasted trace precisely where the historical trace ends, removing any ugly data overlaps while maintaining Plotly's auto-scaling Y-axis behaviors.

- **Frontend Cache Isolation (Workspace Security):**
  - **Strict Per-User Browser State:** Identified and resolved a severe data leakage vulnerability where live, unsaved canvas configurations were cached globally in the browser's `localStorage`.
  - **Session Sandboxing:** Dynamically prefixed all `localStorage` state keys (e.g. `obs_charts`, `pred_canvas`) with the actively authenticated User's UUID. This completely isolates workspaces, ensuring that multiple users sharing the same computer/browser cannot view or overwrite each other's live, unsaved BI canvases.

- **Granular Administrative Controls:**
  - **Module-Level Privileges:** Upgraded the Admin Management console to allow Superadmins to strictly toggle access to individual system modules (e.g., Data Selection, Uploading, Observations) for specific Zone Admins.
  - **Dynamic Navigation:** The frontend seamlessly ingests these `disabled_modules` and dynamically reconstructs the navigation sidebar, instantly removing restricted modules from the UI entirely without requiring page reloads.

- **Unified Data Management & Ingestion:**
  - **Centralized Data Hub:** Consolidated user-uploaded datasets and submitted Monthly Reports into a single, high-level "Data Management" workspace accessible exclusively to administrative tiers.
  - **One-Click ETL Ingestion:** Admins can preview user-submitted files and invoke a 1-click "Import to Data Uploading" pipeline. This automatically extracts raw JSON/CSV and legacy Python Numpy structures, casts them into standard primitives, and aggregates them into high-performance analytical Parquet files ready for the DuckDB engine.

- **Aesthetic UI Modernization:**
  - **Custom Notification Ecosystem:** Systematically ripped out all legacy browser `alert()` popups across the application, replacing them with custom, DOM-integrated notification banners that perfectly match the application's clean, green branding aesthetic.
