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

# Never run as root.
RUN adduser --system --uid 1001 --group jobtracker
COPY --from=build --chown=jobtracker:jobtracker /app/publish .
USER jobtracker

ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_TieredPGO=1
EXPOSE 8080

ENTRYPOINT ["dotnet", "JobTracker.Api.dll"]
