# Azure SQL search indexes and full-text catalog

Azure SQL Database does not support PostgreSQL trigram indexes. This migration
provisions equivalent search capabilities by:

- Creating the `FaaSearchCatalog` full-text catalog
- Enabling full-text indexes on aircraft tail numbers, manufacturer names, and owner names
- Adding covering nonclustered indexes tailored to the API's lookup patterns

These objects ensure airplane search performance matches the previous
`pg_trgm`-enabled PostgreSQL deployment.
