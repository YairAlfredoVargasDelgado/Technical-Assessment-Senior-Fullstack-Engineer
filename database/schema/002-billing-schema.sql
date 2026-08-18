DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'billing') THEN
        CREATE SCHEMA billing;
    END IF;
END $EF$;
CREATE TABLE IF NOT EXISTS billing."__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM billing."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025913_InitialBilling') THEN
        IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'billing') THEN
            CREATE SCHEMA billing;
        END IF;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM billing."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025913_InitialBilling') THEN
    CREATE TABLE billing.invoices (
        id uuid NOT NULL,
        organization_id uuid NOT NULL,
        customer_id uuid NOT NULL,
        job_id uuid NOT NULL,
        idempotency_key character varying(200) NOT NULL,
        issued_at_utc timestamp with time zone NOT NULL,
        total_amount numeric(19,4) NOT NULL,
        total_currency character varying(3) NOT NULL,
        CONSTRAINT pk_invoices PRIMARY KEY (id)
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM billing."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025913_InitialBilling') THEN
    CREATE TABLE billing.outbox_message_consumers (
        outbox_message_id uuid NOT NULL,
        name character varying(500) NOT NULL,
        CONSTRAINT pk_outbox_message_consumers PRIMARY KEY (outbox_message_id, name)
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM billing."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025913_InitialBilling') THEN
    CREATE TABLE billing.outbox_messages (
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
    IF NOT EXISTS(SELECT 1 FROM billing."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025913_InitialBilling') THEN
    CREATE INDEX ix_invoices_job_id ON billing.invoices (job_id);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM billing."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025913_InitialBilling') THEN
    CREATE INDEX ix_invoices_organization_issued_at ON billing.invoices (organization_id, issued_at_utc);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM billing."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025913_InitialBilling') THEN
    CREATE UNIQUE INDEX ux_invoices_idempotency_key ON billing.invoices (idempotency_key);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM billing."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025913_InitialBilling') THEN
    CREATE INDEX ix_outbox_messages_unprocessed ON billing.outbox_messages (occurred_on_utc) WHERE processed_on_utc IS NULL;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM billing."__EFMigrationsHistory" WHERE "MigrationId" = '20260818025913_InitialBilling') THEN
    INSERT INTO billing."__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20260818025913_InitialBilling', '9.0.11');
    END IF;
END $EF$;
COMMIT;

