using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NpgsqlTypes;

#nullable disable

namespace JobTracker.Modules.Jobs.Infrastructure.Database.Migrations
{
    /// <inheritdoc />
    public partial class InitialJobs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "jobs");

            migrationBuilder.CreateTable(
                name: "jobs",
                schema: "jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    description = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    scheduled_date_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    assignee_id = table.Column<Guid>(type: "uuid", nullable: true),
                    customer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    organization_id = table.Column<Guid>(type: "uuid", nullable: false),
                    started_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    completed_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    cancelled_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    cancellation_reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    signature_url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: true),
                    created_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    search_vector = table.Column<NpgsqlTsVector>(type: "tsvector", nullable: true, computedColumnSql: "to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))", stored: true),
                    sort_key = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, computedColumnSql: "coalesce(scheduled_date_utc, 'infinity'::timestamptz)", stored: true),
                    address_city = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    address_latitude = table.Column<double>(type: "double precision", nullable: true),
                    address_longitude = table.Column<double>(type: "double precision", nullable: true),
                    address_state = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    address_street = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    address_zip_code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_jobs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "outbox_message_consumers",
                schema: "jobs",
                columns: table => new
                {
                    outbox_message_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_outbox_message_consumers", x => new { x.outbox_message_id, x.name });
                });

            migrationBuilder.CreateTable(
                name: "outbox_messages",
                schema: "jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    type = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    content = table.Column<string>(type: "jsonb", nullable: false),
                    occurred_on_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    processed_on_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    error = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_outbox_messages", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "job_photos",
                schema: "jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    job_id = table.Column<Guid>(type: "uuid", nullable: false),
                    url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    captured_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    caption = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_job_photos", x => x.id);
                    table.ForeignKey(
                        name: "fk_job_photos_jobs_job_id",
                        column: x => x.job_id,
                        principalSchema: "jobs",
                        principalTable: "jobs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_job_photos_job_id",
                schema: "jobs",
                table: "job_photos",
                column: "job_id");

            migrationBuilder.CreateIndex(
                name: "ix_jobs_organization_assignee",
                schema: "jobs",
                table: "jobs",
                columns: new[] { "organization_id", "assignee_id" },
                filter: "assignee_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_jobs_organization_customer",
                schema: "jobs",
                table: "jobs",
                columns: new[] { "organization_id", "customer_id" });

            migrationBuilder.CreateIndex(
                name: "ix_jobs_organization_sort_key_id",
                schema: "jobs",
                table: "jobs",
                columns: new[] { "organization_id", "sort_key", "id" });

            migrationBuilder.CreateIndex(
                name: "ix_jobs_organization_status_scheduled_date",
                schema: "jobs",
                table: "jobs",
                columns: new[] { "organization_id", "status", "scheduled_date_utc" });

            migrationBuilder.CreateIndex(
                name: "ix_jobs_search_vector",
                schema: "jobs",
                table: "jobs",
                column: "search_vector")
                .Annotation("Npgsql:IndexMethod", "GIN");

            migrationBuilder.CreateIndex(
                name: "ix_outbox_messages_unprocessed",
                schema: "jobs",
                table: "outbox_messages",
                column: "occurred_on_utc",
                filter: "processed_on_utc IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "job_photos",
                schema: "jobs");

            migrationBuilder.DropTable(
                name: "outbox_message_consumers",
                schema: "jobs");

            migrationBuilder.DropTable(
                name: "outbox_messages",
                schema: "jobs");

            migrationBuilder.DropTable(
                name: "jobs",
                schema: "jobs");
        }
    }
}
