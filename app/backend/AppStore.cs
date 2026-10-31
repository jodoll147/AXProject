using System.Text.Json;
using Microsoft.AspNetCore.Identity;

// One replacement file contains both business data and its audit trail.
// This store is intended for a single local server process.
sealed class AppStore
{
    private readonly string path;
    private readonly object gate = new();
    private readonly JsonSerializerOptions options = new(JsonSerializerDefaults.Web);
    private readonly PasswordHasher<Account> hasher = new();
    private State state;
    public AppStore(string path)
    {
        this.path = path;
        state = File.Exists(path) ? JsonSerializer.Deserialize<State>(File.ReadAllText(path), options) ?? throw new InvalidDataException("상태 파일이 비어 있습니다.") : new();
    }
    private State Clone() => JsonSerializer.Deserialize<State>(JsonSerializer.Serialize(state, options), options)!;
    public T Read<T>(Func<State, T> read) { lock (gate) return read(Clone()); }
    public T Change<T>(Func<State, T> change)
    {
        lock (gate)
        {
            var copy = Clone();
            var result = change(copy);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var temp = path + ".tmp";
            try { File.WriteAllText(temp, JsonSerializer.Serialize(copy, options)); File.Move(temp, path, true); }
            finally { if (File.Exists(temp)) File.Delete(temp); }
            state = copy;
            return result;
        }
    }
    public string Hash(Account a, string password) => hasher.HashPassword(a, password);
    public bool Check(Account a, string password) => hasher.VerifyHashedPassword(a, a.PasswordHash, password) != PasswordVerificationResult.Failed;
    public void Bootstrap(string? login, string? password, bool allowShortDevelopmentPassword = false)
    {
        if (Read(s => s.Users.Count) > 0 || string.IsNullOrWhiteSpace(login) || string.IsNullOrEmpty(password)) return;
        if (password.Length < 12 && !allowShortDevelopmentPassword) throw new InvalidOperationException("최초 관리자 비밀번호는 12자 이상이어야 합니다.");
        Change(s => { if (s.Users.Count != 0) return 0; var a = new Account { Id = Guid.NewGuid().ToString("N"), Login = login.Trim(), Name = "관리자", Role = "ADMIN" }; a.PasswordHash = Hash(a, password); s.Users.Add(a); Audit(s, a.Id, "bootstrap", "user", a.Id, null, new { a.Id, a.Login, a.Name, a.Role }); return 0; });
    }
    public void AddDemoAdministrator(string? login, string? password)
    {
        if (string.IsNullOrWhiteSpace(login) || string.IsNullOrEmpty(password)) return;
        login = login.Trim();
        Change(s => {
            if (s.Users.Any(u => string.Equals(u.Login, login, StringComparison.OrdinalIgnoreCase))) return 0;
            var account = new Account { Id = Guid.NewGuid().ToString("N"), Login = login, Name = "데모 관리자", Role = "ADMIN" };
            account.PasswordHash = Hash(account, password);
            s.Users.Add(account);
            Audit(s, account.Id, "demo:bootstrap", "user", account.Id, null, new { account.Id, account.Login, account.Name, account.Role });
            return 0;
        });
    }
    public static void Audit(State s, string actor, string action, string table, string id, object? before, object? after) => s.Audits.Add(new AuditEntry { Id = Guid.NewGuid().ToString("N"), At = DateTimeOffset.UtcNow, Actor = actor, Action = action, Target = table, TargetId = id, Before = before, After = after });
}
sealed class State
{
    public List<Account> Users { get; set; } = [];
    public Dictionary<string, List<string>> Permissions { get; set; } = new() { ["VIEWER"] = ["read"], ["WORKER"] = ["read", "work"], ["ADMIN"] = ["read", "work", "upload", "manage"] };
    public Dictionary<string, List<Dictionary<string, object?>>>? Data { get; set; }
    public string Mode { get; set; } = "legacy";
    public List<AuditEntry> Audits { get; set; } = [];
}
sealed class Account
{
    public string Id { get; set; } = "";
    public string Login { get; set; } = "";
    public string Name { get; set; } = "";
    public string Role { get; set; } = "VIEWER";
    public bool Active { get; set; } = true;
    public int SessionVersion { get; set; }
    public string PasswordHash { get; set; } = "";
    public List<string> Assignments { get; set; } = [];
}
sealed class AuditEntry
{
    public string Id { get; set; } = "";
    public DateTimeOffset At { get; set; }
    public string Actor { get; set; } = "";
    public string Action { get; set; } = "";
    public string Target { get; set; } = "";
    public string TargetId { get; set; } = "";
    public object? Before { get; set; }
    public object? After { get; set; }
}
record LoginRequest(string Login, string Password);
record UserRequest(string Login, string Name, string Role, string Password, bool Active, List<string>? Assignments);
record PermissionsRequest(Dictionary<string, List<string>> Permissions);
record WorkEntryRequest(string Table, Dictionary<string,string> Row, string? Id);
