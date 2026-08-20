namespace KAster.Desktop.Softphone;

public enum RegistrationState
{
    Stopped,
    Registering,
    Registered,
    Failed,
}

public sealed record RegistrationStatus(RegistrationState State, string? Reason = null);
