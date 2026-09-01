# BI Platform MongoDB ERD

This Entity Relationship Diagram (ERD) illustrates the NoSQL collections and their logical relationships in the MongoDB database. 

```mermaid
erDiagram
    USERS ||--o{ TABLES : "created_by"
    USERS ||--o{ SAVED_MODELS : "created_by"
    USERS ||--o{ SAVED_DASHBOARDS : "created_by"
    USERS ||--o{ ACTIVITIES : "user_id"
    DEPARTMENTS ||--o{ USERS : "department"
    DEPARTMENTS ||--o{ TABLES : "department"
    DEPARTMENTS ||--o{ SAVED_MODELS : "department"
    DEPARTMENTS ||--o{ SAVED_DASHBOARDS : "department"

    USERS {
        ObjectId _id PK
        string email
        string hashed_password
        string role "superadmin, admin, user"
        string department FK "Nullable for Superadmin"
        boolean is_active
        boolean is_verified
        object privileges "e.g., can_manage_users"
        datetime created_at
    }

    DEPARTMENTS {
        ObjectId _id PK
        string name
        boolean is_active
        datetime created_at
    }

    TABLES {
        ObjectId _id PK
        string filename
        string department FK
        string created_by FK
        datetime created_at
        array columns "[{name, type}]"
    }

    SAVED_MODELS {
        ObjectId _id PK
        string model_name
        string department FK
        string created_by FK
        datetime created_at
        array columns "[{table_id, column, alias}]"
        array joins "[{source_table_id, target_table_id, source_column, target_column, join_type}]"
    }

    SAVED_DASHBOARDS {
        ObjectId _id PK
        string name
        string department FK
        string created_by FK
        datetime created_at
        datetime updated_at
        array charts "JSON configuration for visualizations"
    }

    ACTIVITIES {
        ObjectId _id PK
        string user_id FK
        string email
        string role
        string department
        string action "e.g., Generate Observation Visual"
        object details "e.g., { dataset: 'model_name', visuals: ['bar'] }"
        datetime timestamp
    }
```

> [!NOTE]
> Unlike traditional SQL databases, MongoDB uses ObjectIds to link collections logically rather than strictly enforcing foreign key constraints. The `department` string is used heavily across collections to ensure Data Siloing at the query level.
