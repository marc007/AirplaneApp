-- CreateTable
CREATE TABLE "AircraftSearchLog" (
    "id" SERIAL PRIMARY KEY,
    "tailNumber" VARCHAR(10) NOT NULL,
    "searchQuery" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
