namespace KAster.Desktop.Core.Contracts;

/// <summary>
/// 서버의 모든 응답 형태. <c>ResponseTransformInterceptor</c> 가 붙이는 봉투다.
/// </summary>
public sealed class ApiEnvelope<T>
{
    public bool Success { get; init; }
    public T? Data { get; init; }
    public ApiError? Error { get; init; }
}

public sealed class ApiError
{
    public string? Code { get; init; }
    public string Message { get; init; } = string.Empty;
}
