# Baseline FAA schema for Azure SQL Database

This migration recreates the FAA reference schema using SQL Server primitives so
it can run on Azure SQL Database. It replaces PostgreSQL-specific constructs
with:

- `IDENTITY` columns for auto-incrementing identifiers
- `NVARCHAR` columns (including `NVARCHAR(MAX)` for large text)
- `DATETIME2` timestamps with UTC defaults

Foreign keys, composite primary keys, and relational indexes mirror the previous
PostgreSQL structure without using extensions or enums.
