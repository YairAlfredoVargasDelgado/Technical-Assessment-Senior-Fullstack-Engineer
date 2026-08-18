using JobTracker.Common.Application.Models;
using JobTracker.Common.Domain.Results;
using JobTracker.Common.Presentation.Endpoints;
using JobTracker.Common.Presentation.Results;
using JobTracker.Modules.Jobs.Application.Jobs.CancelJob;
using JobTracker.Modules.Jobs.Application.Jobs.CompleteJob;
using JobTracker.Modules.Jobs.Application.Jobs.CreateJob;
using JobTracker.Modules.Jobs.Application.Jobs.GetJobById;
using JobTracker.Modules.Jobs.Application.Jobs.SearchJobs;
using JobTracker.Modules.Jobs.Application.Jobs.StartJob;
using JobTracker.Modules.Jobs.Domain.Jobs;

using MediatR;

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace JobTracker.Modules.Jobs.Presentation.Jobs;

/// <summary>
/// The Jobs module's HTTP surface.
/// </summary>
/// <remarks>
/// <para>
/// Every handler here is two statements: build a message, send it, map the
/// result. There is no business logic, no validation and no data access, because
/// the transport layer's only job is to translate between HTTP and the
/// application's vocabulary. That is what makes the same use cases reachable from
/// a background job or a gRPC endpoint without being reimplemented.
/// </para>
/// <para>
/// State transitions are sub-resource <c>POST</c>s (<c>/jobs/{id}/complete</c>)
/// rather than a <c>PATCH</c> that sets a status field. A <c>PATCH</c> would
/// invite clients to construct arbitrary status changes and would put the
/// question "is this transition legal?" on the wire; naming the action keeps the
/// state machine's authority in the domain.
/// </para>
/// </remarks>
internal sealed class JobEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/jobs")
            .WithTags("Jobs")
            .RequireAuthorization();

        group.MapGet("/", SearchJobs)
            .WithName("SearchJobs")
            .WithSummary("Searches jobs within the caller's organization.")
            .Produces<PagedList<JobResponse>>()
            .ProducesProblem(StatusCodes.Status400BadRequest);

        group.MapGet("/{jobId:guid}", GetJobById)
            .WithName("GetJobById")
            .WithSummary("Loads a single job.")
            .Produces<JobResponse>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPost("/", CreateJob)
            .WithName("CreateJob")
            .WithSummary("Creates a job, as a draft or already scheduled.")
            .Produces<Guid>(StatusCodes.Status201Created)
            .ProducesProblem(StatusCodes.Status400BadRequest);

        group.MapPost("/{jobId:guid}/start", StartJob)
            .WithName("StartJob")
            .WithSummary("Marks a scheduled job as in progress.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPost("/{jobId:guid}/complete", CompleteJob)
            .WithName("CompleteJob")
            .WithSummary("Completes a job in progress and triggers invoicing.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPost("/{jobId:guid}/cancel", CancelJob)
            .WithName("CancelJob")
            .WithSummary("Cancels a job that has not finished.")
            .Produces(StatusCodes.Status204NoContent)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);
    }

    /// <remarks>
    /// Filters arrive as query-string parameters rather than a POSTed body so the
    /// result stays cacheable, linkable and replayable from a browser address bar.
    /// </remarks>
    private static async Task<IResult> SearchJobs(
        ISender sender,
        CancellationToken cancellationToken,
        string? searchTerm = null,
        JobStatus[]? status = null,
        DateTime? scheduledFrom = null,
        DateTime? scheduledTo = null,
        Guid? assigneeId = null,
        string? cursor = null,
        int limit = JobSearchCriteria.DefaultLimit)
    {
        var result = await sender.Send(
            new SearchJobsQuery(searchTerm, status, scheduledFrom, scheduledTo, assigneeId, cursor, limit),
            cancellationToken);

        return result.Match(Microsoft.AspNetCore.Http.Results.Ok);
    }

    private static async Task<IResult> GetJobById(Guid jobId, ISender sender, CancellationToken cancellationToken)
    {
        var result = await sender.Send(new GetJobByIdQuery(jobId), cancellationToken);

        return result.Match(Microsoft.AspNetCore.Http.Results.Ok);
    }

    private static async Task<IResult> CreateJob(
        CreateJobCommand command,
        ISender sender,
        CancellationToken cancellationToken)
    {
        var result = await sender.Send(command, cancellationToken);

        // 201 with a Location header: the client learns where the new resource
        // lives without having to construct the URL itself.
        return result.Match(jobId => Microsoft.AspNetCore.Http.Results.Created($"/api/jobs/{jobId}", jobId));
    }

    private static async Task<IResult> StartJob(Guid jobId, ISender sender, CancellationToken cancellationToken)
        => await SendTransition(sender, new StartJobCommand(jobId), cancellationToken);

    private static async Task<IResult> CompleteJob(
        Guid jobId,
        CompleteJobRequest request,
        ISender sender,
        CancellationToken cancellationToken)
        => await SendTransition(sender, new CompleteJobCommand(jobId, request.SignatureUrl), cancellationToken);

    private static async Task<IResult> CancelJob(
        Guid jobId,
        CancelJobRequest request,
        ISender sender,
        CancellationToken cancellationToken)
        => await SendTransition(sender, new CancelJobCommand(jobId, request.Reason), cancellationToken);

    /// <summary>
    /// Dispatches a state-transition command and renders 204 or a problem.
    /// </summary>
    /// <remarks>
    /// The three transition endpoints differ only in the message they build. This
    /// is the part that is genuinely identical, so it is written once — while each
    /// endpoint keeps its own route, its own request shape and its own OpenAPI
    /// description, which are the parts that actually differ.
    /// </remarks>
    private static async Task<IResult> SendTransition(
        ISender sender,
        IRequest<Result<Unit>> command,
        CancellationToken cancellationToken)
    {
        var result = await sender.Send(command, cancellationToken);

        return result.IsSuccess
            ? Microsoft.AspNetCore.Http.Results.NoContent()
            : ((Result)result).ToProblemDetails();
    }

    /// <summary>
    /// Body of a completion request.
    /// </summary>
    /// <remarks>
    /// The job identifier comes from the route, so it is deliberately absent here:
    /// accepting it in both places would create the possibility of the two
    /// disagreeing and a rule about which one wins.
    /// </remarks>
    internal sealed record CompleteJobRequest(string SignatureUrl);

    internal sealed record CancelJobRequest(string Reason);
}
