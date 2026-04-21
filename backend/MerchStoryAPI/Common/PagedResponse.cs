namespace MerchStoryAPI.Common;

public sealed record PagedResponse<T>(List<T> Items, int Total, int Page, int PageSize);
