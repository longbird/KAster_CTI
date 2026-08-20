namespace KAster.Desktop.Core.Server;

/// <summary>서버가 <c>success: false</c> 로 답했거나 HTTP 오류를 낸 경우.</summary>
public sealed class CtiServerException : Exception
{
    public CtiServerException(string message, string? code = null, int? statusCode = null)
        : base(message)
    {
        Code = code;
        StatusCode = statusCode;
    }

    public string? Code { get; }
    public int? StatusCode { get; }
}
