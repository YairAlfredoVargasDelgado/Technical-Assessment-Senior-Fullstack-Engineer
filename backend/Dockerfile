# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Multi-stage build. The restore layer is cached on the project files alone, so
# a source-only change never re-downloads NuGet packages.
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Central package management files first: they define the restore graph.
COPY Directory.Build.props Directory.Packages.props JobTracker.sln ./
COPY src/Common/JobTracker.Common.Domain/*.csproj                                   src/Common/JobTracker.Common.Domain/
COPY src/Common/JobTracker.Common.Application/*.csproj                              src/Common/JobTracker.Common.Application/
COPY src/Common/JobTracker.Common.Infrastructure/*.csproj                           src/Common/JobTracker.Common.Infrastructure/
COPY src/Common/JobTracker.Common.Presentation/*.csproj                             src/Common/JobTracker.Common.Presentation/
COPY src/Modules/Jobs/JobTracker.Modules.Jobs.Domain/*.csproj                        src/Modules/Jobs/JobTracker.Modules.Jobs.Domain/
COPY src/Modules/Jobs/JobTracker.Modules.Jobs.IntegrationEvents/*.csproj             src/Modules/Jobs/JobTracker.Modules.Jobs.IntegrationEvents/
COPY src/Modules/Jobs/JobTracker.Modules.Jobs.Application/*.csproj                   src/Modules/Jobs/JobTracker.Modules.Jobs.Application/
COPY src/Modules/Jobs/JobTracker.Modules.Jobs.Infrastructure/*.csproj                src/Modules/Jobs/JobTracker.Modules.Jobs.Infrastructure/
COPY src/Modules/Jobs/JobTracker.Modules.Jobs.Presentation/*.csproj                  src/Modules/Jobs/JobTracker.Modules.Jobs.Presentation/
COPY src/Modules/Billing/JobTracker.Modules.Billing.Domain/*.csproj                  src/Modules/Billing/JobTracker.Modules.Billing.Domain/
COPY src/Modules/Billing/JobTracker.Modules.Billing.IntegrationEvents/*.csproj       src/Modules/Billing/JobTracker.Modules.Billing.IntegrationEvents/
COPY src/Modules/Billing/JobTracker.Modules.Billing.Application/*.csproj             src/Modules/Billing/JobTracker.Modules.Billing.Application/
COPY src/Modules/Billing/JobTracker.Modules.Billing.Infrastructure/*.csproj          src/Modules/Billing/JobTracker.Modules.Billing.Infrastructure/
COPY src/JobTracker.Api/*.csproj                                                     src/JobTracker.Api/
COPY tests/JobTracker.Jobs.Domain.UnitTests/*.csproj                                 tests/JobTracker.Jobs.Domain.UnitTests/
COPY tests/JobTracker.Jobs.Application.UnitTests/*.csproj                            tests/JobTracker.Jobs.Application.UnitTests/
COPY tests/JobTracker.ArchitectureTests/*.csproj                                     tests/JobTracker.ArchitectureTests/

RUN dotnet restore src/JobTracker.Api/JobTracker.Api.csproj

COPY . .
RUN dotnet publish src/JobTracker.Api/JobTracker.Api.csproj \
      -c Release -o /app/publish --no-restore /p:UseAppHost=false

# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

# The ASP.NET runtime image is Debian slim: it ships neither curl nor wget, so a
# HEALTHCHECK written against either exits 127 on every probe and the container
# is reported unhealthy without a single request ever reaching the application.
# That is not hypothetical — it is what this image did until CI caught it, and
# the symptom was silent, because a health probe that never runs logs nothing.
#
# curl is installed explicitly so the check below depends on something this
# Dockerfile guarantees, rather than on what a base image happens to include.
RUN apt-get update \
 && apt-get install --yes --no-install-recommends curl \
 && rm --recursive --force /var/lib/apt/lists/*

# Never run as root.
RUN adduser --system --uid 1001 --group jobtracker
COPY --from=build --chown=jobtracker:jobtracker /app/publish .
USER jobtracker

ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_TieredPGO=1
EXPOSE 8080

# Declared here rather than in docker-compose.yml so the image knows how to prove
# it is alive whatever starts it, matching the frontend image. `--fail` is what
# makes curl exit non-zero on a 5xx; without it a broken app answering with 500
# reports as healthy.
#
# The start period covers applying EF Core migrations on boot, which is the
# slowest thing this container does before it can serve.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=12 \
  CMD curl --fail --silent --show-error http://127.0.0.1:8080/health/live || exit 1

ENTRYPOINT ["dotnet", "JobTracker.Api.dll"]
