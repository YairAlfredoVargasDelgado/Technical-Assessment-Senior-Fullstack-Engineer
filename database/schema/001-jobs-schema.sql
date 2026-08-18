DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'jobs') THEN
        CREATE SCHEMA jobs;
    END IF;
END $EF$;
CREATE TABLE IF NOT EXISTS jobs."__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM jobs."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025905_InitialJobs') THEN
        IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'jobs') THEN
            CREATE SCHEMA jobs;
        END IF;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM jobs."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025905_InitialJobs') THEN
    CREATE TABLE jobs.jobs (
        id uuid NOT NULL,
        title character varying(200) NOT NULL,
        description character varying(4000),
        status character varying(30) NOT NULL,
        scheduled_date_utc timestamp with time zone,
        assignee_id uuid,
        customer_id uuid NOT NULL,
        organization_id uuid NOT NULL,
        started_at_utc timestamp with time zone,
        completed_at_utc timestamp with time zone,
        cancelled_at_utc timestamp with time zone,
        cancellation_reason character varying(500),
        signature_url character varying(2048),
        created_at_utc timestamp with time zone NOT NULL,
        updated_at_utc timestamp with time zone NOT NULL,
        search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) STORED,
        sort_key timestamp with time zone GENERATED ALWAYS AS (coalesce(scheduled_date_utc, 'infinity'::timestamptz)) STORED NOT NULL,
        address_city character varying(150) NOT NULL,
        address_latitude double precision,
        address_longitude double precision,
        address_state character varying(100) NOT NULL,
        address_street character varying(300) NOT NULL,
        address_zip_code character varying(20) NOT NULL,
        CONSTRAINT pk_jobs PRIMARY KEY (id)
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM jobs."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025905_InitialJobs') THEN
    CREATE TABLE jobs.outbox_message_consumers (
        outbox_message_id uuid NOT NULL,
        name character varying(500) NOT NULL,
        CONSTRAINT pk_outbox_message_consumers PRIMARY KEY (outbox_message_id, name)
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM jobs."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025905_InitialJobs') THEN
    CREATE TABLE jobs.outbox_messages (
        id uuid NOT NULL,
        type character varying(500) NOT NULL,
        content jsonb NOT NULL,
        occurred_on_utc timestamp with time zone NOT NULL,
        processed_on_utc timestamp with time zone,
        error text,
        CONSTRAINT pk_outbox_messages PRIMARY KEY (id)
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM jobs."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025905_InitialJobs') THEN
    CREATE TABLE jobs.job_photos (
        id uuid NOT NULL,
        job_id uuid NOT NULL,
        url character varying(2048) NOT NULL,
        captured_at_utc timestamp with time zone NOT NULL,
        caption character varying(500),
        CONSTRAINT pk_job_photos PRIMARY KEY (id),
        CONSTRAINT fk_job_photos_jobs_job_id FOREIGN KEY (job_id) REFERENCES jobs.jobs (id) ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM jobs."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025905_InitialJobs') THEN
    CREATE INDEX ix_job_photos_job_id ON jobs.job_photos (job_id);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM jobs."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025905_InitialJobs') THEN
    CREATE INDEX ix_jobs_organization_assignee ON jobs.jobs (organization_id, assignee_id) WHERE assignee_id IS NOT NULL;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM jobs."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025905_InitialJobs') THEN
    CREATE INDEX ix_jobs_organization_customer ON jobs.jobs (organization_id, customer_id);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM jobs."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025905_InitialJobs') THEN
    CREATE INDEX ix_jobs_organization_sort_key_id ON jobs.jobs (organization_id, sort_key, id);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM jobs."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025905_InitialJobs') THEN
    CREATE INDEX ix_jobs_organization_status_scheduled_date ON jobs.jobs (organization_id, status, scheduled_date_utc);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM jobs."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025905_InitialJobs') THEN
    CREATE INDEX ix_jobs_search_vector ON jobs.jobs USING GIN (search_vector);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM jobs."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025905_InitialJobs') THEN
    CREATE INDEX ix_outbox_messages_unprocessed ON jobs.outbox_messages (occurred_on_utc) WHERE processed_on_utc IS NULL;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM jobs."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025905_InitialJobs') THEN
    INSERT INTO jobs."__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20260818025905_InitialJobs', '9.0.11');
    END IF;
END $EF$;
COMMIT;

