using ClosedXML.Excel;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var keyDirectory = Environment.GetEnvironmentVariable("AX_KEY_DIR") ?? Path.Combine(builder.Environment.ContentRootPath, "data-protection-keys");
Directory.CreateDirectory(keyDirectory);
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(keyDirectory));
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options => {
    options.Cookie.HttpOnly = true; options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    options.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; };
    options.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options => { options.RejectionStatusCode = 429; options.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })); });
var app = builder.Build();
var root = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", ".."));
var workbookPath = Path.Combine(root, "엑셀 파일", "02_조선_샘플데이터.xlsx");
var specificationPath = Path.Combine(root, "엑셀 파일", "01_조선_데이터참고명세서.xlsx");
var localDataPath = Path.Combine(root, "app", "backend", "local-data.json");
var statePath = Environment.GetEnvironmentVariable("AX_STATE_PATH") ?? Path.Combine(root, "app", "backend", "app-state.json");
var store = new AppStore(Path.GetFullPath(statePath));
store.Bootstrap(Environment.GetEnvironmentVariable("AX_ADMIN_LOGIN"), Environment.GetEnvironmentVariable("AX_ADMIN_PASSWORD"),
    app.Environment.IsDevelopment() && Environment.GetEnvironmentVariable("AX_ALLOW_SHORT_DEV_ADMIN_PASSWORD") == "1");
if (Environment.GetEnvironmentVariable("AX_DEMO_MODE") == "1")
    store.AddDemoAdministrator(Environment.GetEnvironmentVariable("AX_DEMO_ADMIN_LOGIN"), Environment.GetEnvironmentVariable("AX_DEMO_ADMIN_PASSWORD"));
var tables = new[] { "vessels", "zones", "processes", "equipment", "blocks", "status_codes", "work_orders", "production_plan", "production_actual", "equipment_intervals", "incidents", "work_history", "inspections", "rework", "equipment_snapshot" };
var requiredTables = new[] { "vessels", "zones", "processes", "equipment", "blocks", "status_codes", "work_orders", "production_plan", "equipment_snapshot" };
var cacheLock = new object();
DateTime cachedWrite = DateTime.MinValue;
string? cachedSource = null;
Dictionary<string, List<Dictionary<string, object?>>>? cached = null;

Dictionary<string, List<Dictionary<string, object?>>> LoadData()
{
    lock (cacheLock)
    {
        var snapshot = store.Read(s => (s.Data, s.Mode));
        if (snapshot.Data is not null) return tables.ToDictionary(table => table, table => snapshot.Data.GetValueOrDefault(table) ?? []);
        var source = snapshot.Mode == "legacy" && File.Exists(localDataPath) ? localDataPath : workbookPath;
        if (!File.Exists(source)) return tables.ToDictionary(table => table, _ => new List<Dictionary<string, object?>>());
        var write = File.GetLastWriteTimeUtc(source);
        if (cached is not null && write == cachedWrite && source == cachedSource) return cached;
        if (source == localDataPath)
        {
            var local = JsonSerializer.Deserialize<Dictionary<string, List<Dictionary<string, object?>>>>(File.ReadAllText(localDataPath))
                ?? throw new InvalidDataException("로컬 데이터가 비어 있습니다.");
            cached = tables.ToDictionary(table => table, table => local.GetValueOrDefault(table) ?? []);
            cachedWrite = write;
            cachedSource = source;
            return cached;
        }
        using var book = new XLWorkbook(workbookPath);
        var result = new Dictionary<string, List<Dictionary<string, object?>>>();
        foreach (var table in tables)
        {
            var sheet = book.Worksheet(table);
            var used = sheet.RangeUsed();
            if (used is null) { result[table] = []; continue; }
            var header = used.FirstRow().Cells().Select(c => c.GetString().Trim()).ToArray();
            var rows = new List<Dictionary<string, object?>>();
            foreach (var row in used.RowsUsed().Skip(1))
            {
                var item = new Dictionary<string, object?>();
                for (var index = 0; index < header.Length; index++)
                {
                    if (header[index].Length == 0) continue;
                    var cell = row.Cell(index + 1);
                    if (cell.IsEmpty()) continue;
                    object? value = cell.DataType switch
                    {
                        XLDataType.DateTime => cell.GetDateTime().ToString("yyyy-MM-ddTHH:mm", CultureInfo.InvariantCulture),
                        XLDataType.Number => cell.GetDouble() is var n && n == Math.Truncate(n) ? (object)(long)n : cell.GetDouble(),
                        XLDataType.Boolean => cell.GetBoolean(),
                        _ => cell.GetString()
                    };
                    item[header[index]] = value;
                }
                if (item.Count > 0) rows.Add(item);
            }
            result[table] = rows;
        }
        cached = result;
        cachedWrite = write;
        cachedSource = source;
        return result;
    }
}

void SaveData(Dictionary<string, List<Dictionary<string, object?>>> data, string actor, string action, object? before)
{
    store.Change(s => { s.Data = data; s.Mode = "local"; AppStore.Audit(s, actor, action, "data", "all", before, data); return 0; });
    cached = null;
}

Dictionary<string, List<FieldSpec>> LoadSpec()
{
    if (!File.Exists(specificationPath)) throw new FileNotFoundException("항목 명세 파일을 찾을 수 없습니다.", specificationPath);
    using var book = new XLWorkbook(specificationPath);
    var result = new Dictionary<string, List<FieldSpec>>();
    foreach (var row in book.Worksheet("항목명세").RowsUsed().Skip(2))
    {
        var table = row.Cell(1).GetString().Trim();
        var field = row.Cell(2).GetString().Trim();
        if (!tables.Contains(table) || field.Length == 0) continue;
        if (!result.TryGetValue(table, out var fields)) result[table] = fields = [];
        var key = row.Cell(6).GetString().Trim();
        fields.Add(new FieldSpec(field, row.Cell(3).GetString().Trim(), row.Cell(4).GetString().Trim(), row.Cell(5).GetString().Trim() == "필수", key is "—" or "-" ? "" : key));
    }
    return result;
}

bool Ready(Dictionary<string, List<Dictionary<string, object?>>> data)
{
    if (requiredTables.Any(table => data[table].Count == 0)) return false;
    var orders = data["work_orders"].Select(row => $"{row.GetValueOrDefault("block_id")}|{row.GetValueOrDefault("process_id")}").ToHashSet();
    return data["blocks"].All(block => data["processes"].All(process => orders.Contains($"{block.GetValueOrDefault("block_id")}|{process.GetValueOrDefault("process_id")}")));
}

// Serve the production frontend from the same origin as the API.
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseRouting();
app.UseAuthentication();
app.UseRateLimiter();
app.Use(async (ctx, next) => {
    if (!ctx.Request.Path.StartsWithSegments("/api")) { await next(); return; }
    var path = ctx.Request.Path.Value ?? "";
    if (ctx.Request.Path.StartsWithSegments("/api/auth")) ctx.Response.Headers.CacheControl = "no-store";
    if (!HttpMethods.IsGet(ctx.Request.Method) && ctx.Request.Headers["X-Requested-With"] != "AXProject") { ctx.Response.StatusCode = 400; return; }
    if (path is "/api/health" or "/api/auth/login" or "/api/auth/me" or "/api/auth/logout") { await next(); return; }
    var id = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
    var user = id is null ? null : store.Read(s => s.Users.FirstOrDefault(u => u.Id == id && u.Active));
    if (user is null || ctx.User.FindFirstValue("session_version") != user.SessionVersion.ToString(CultureInfo.InvariantCulture)) { ctx.Response.StatusCode = 401; return; }
    ctx.Items["account"] = user;
    var needed = path.StartsWith("/api/admin") ? "manage" : path.StartsWith("/api/work") ? "work" :
        path.StartsWith("/api/data/") && !HttpMethods.IsGet(ctx.Request.Method) ? "upload" : "read";
    var allowed = user.Role == "ADMIN" || (needed != "manage" && store.Read(s => s.Permissions.GetValueOrDefault(user.Role)?.Contains(needed) == true));
    if (!allowed) { ctx.Response.StatusCode = 403; return; }
    await next();
});
string Actor(HttpContext ctx) => ((Account)ctx.Items["account"]!).Id;
object PublicUser(Account u) => new { u.Id, u.Login, u.Name, u.Role, u.Active, u.Assignments };

app.MapGet("/api/auth/me", (HttpContext ctx) => {
    var id = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
    var user = id is null ? null : store.Read(s => s.Users.FirstOrDefault(u => u.Id == id && u.Active));
    if (user is not null && ctx.User.FindFirstValue("session_version") != user.SessionVersion.ToString(CultureInfo.InvariantCulture)) user = null;
    return Results.Ok(new { user = user is null ? null : PublicUser(user), permissions = user is null ? Array.Empty<string>() : store.Read(s => s.Permissions.GetValueOrDefault(user.Role)?.ToArray() ?? []), initialized = store.Read(s => s.Users.Count != 0) });
});
app.MapPost("/api/auth/login", async (HttpContext ctx, LoginRequest request) => {
    var user = store.Read(s => s.Users.FirstOrDefault(u => u.Active && string.Equals(u.Login, request.Login?.Trim(), StringComparison.OrdinalIgnoreCase)));
    if (user is null || string.IsNullOrEmpty(request.Password) || !store.Check(user, request.Password)) return Results.Json(new { message = "아이디 또는 비밀번호가 올바르지 않습니다." }, statusCode: 401);
    var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, user.Id), new Claim("session_version", user.SessionVersion.ToString(CultureInfo.InvariantCulture))], CookieAuthenticationDefaults.AuthenticationScheme);
    await ctx.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
    return Results.Ok(new { user = PublicUser(user) });
}).RequireRateLimiting("login");
app.MapPost("/api/auth/logout", async (HttpContext ctx) => { await ctx.SignOutAsync(); return Results.Ok(); });
app.MapGet("/api/admin/users", () => Results.Ok(store.Read(s => s.Users.Select(PublicUser).ToArray())));
app.MapPost("/api/admin/layout", (HttpContext ctx, LayoutRequest request) => {
    lock (cacheLock)
    {
        var data = LoadData();
        var error = LayoutCoordinates.Validate(request.Zones, data["zones"]);
        if (error is not null) return Results.BadRequest(new { message = error });
        foreach (var z in request.Zones!)
        {
            var row = data["zones"].Single(r => r["zone_id"]?.ToString() == z.ZoneId);
            if (LayoutCoordinates.Coordinate(row.GetValueOrDefault("x")) != z.PreviousX || LayoutCoordinates.Coordinate(row.GetValueOrDefault("y")) != z.PreviousY)
                return Results.Conflict(new { message = "다른 작업자가 배치를 변경했습니다. 최신 배치를 다시 불러오세요." });
        }
        // Clone before mutation: cached input must not change if persistence fails.
        var updated = JsonSerializer.Deserialize<Dictionary<string, List<Dictionary<string, object?>>>>(JsonSerializer.Serialize(data))!;
        var before = request.Zones!.Select(z => new { z.ZoneId, X = z.PreviousX, Y = z.PreviousY }).ToArray();
        foreach (var z in request.Zones!)
        {
            var row = updated["zones"].Single(r => r["zone_id"]?.ToString() == z.ZoneId);
            row["x"] = z.X; row["y"] = z.Y;
        }
        store.Change(s => { s.Data = updated; s.Mode = "local"; AppStore.Audit(s, Actor(ctx), "layout:update", "zones", string.Join(",", request.Zones!.Select(z => z.ZoneId)), before, request.Zones!.Select(z => new { z.ZoneId, z.X, z.Y }).ToArray()); return 0; });
        cached = null;
        return Results.Ok(new { zones = updated["zones"] });
    }
});
app.MapGet("/api/admin/permissions", () => Results.Ok(store.Read(s => s.Permissions)));
app.MapGet("/api/admin/audit", (string? actor, string? action, string? target, DateTimeOffset? from, DateTimeOffset? to) => Results.Ok(store.Read(s => s.Audits.AsEnumerable().Where(a => (string.IsNullOrWhiteSpace(actor) || a.Actor.Contains(actor, StringComparison.OrdinalIgnoreCase)) && (string.IsNullOrWhiteSpace(action) || a.Action.Contains(action, StringComparison.OrdinalIgnoreCase)) && (string.IsNullOrWhiteSpace(target) || (a.Target + " " + a.TargetId).Contains(target, StringComparison.OrdinalIgnoreCase)) && (!from.HasValue || a.At >= from.Value) && (!to.HasValue || a.At <= to.Value)).Reverse().Take(200).ToArray())));
app.MapPost("/api/admin/permissions", (HttpContext ctx, PermissionsRequest req) => {
    var permissible = new[] { "read", "work", "upload" };
    if (req.Permissions is null || req.Permissions.Keys.Any(k => k is not ("VIEWER" or "WORKER")) || req.Permissions.Count != 2 || req.Permissions.Values.Any(p => p is null || p.Any(x => !permissible.Contains(x)) || !p.Contains("read"))) return Results.BadRequest(new { message = "조회 권한과 유효한 역할별 권한을 확인하세요." });
    store.Change(s => { var before = s.Permissions.ToDictionary(x => x.Key, x => x.Value.ToList()); foreach (var (k,v) in req.Permissions) s.Permissions[k] = v.Distinct().ToList(); AppStore.Audit(s, Actor(ctx), "permissions", "roles", "all", before, s.Permissions); return 0; });
    return Results.Ok();
});
app.MapPost("/api/admin/users", (HttpContext ctx, UserRequest req) => {
    if (string.IsNullOrWhiteSpace(req.Login) || string.IsNullOrWhiteSpace(req.Name) || req.Role is not ("ADMIN" or "WORKER" or "VIEWER") || req.Password is null || req.Password.Length < 12) return Results.BadRequest(new { message = "아이디, 이름, 역할과 12자 이상 비밀번호를 확인하세요." });
    lock(cacheLock) {
      var ids = LoadData()["work_orders"].Select(r => r.GetValueOrDefault("work_order_id")?.ToString()).ToHashSet();
      if ((req.Assignments ?? []).Any(x => !ids.Contains(x))) return Results.BadRequest(new { message = "존재하지 않는 작업 배정입니다." });
      if (store.Read(s => s.Users.Any(u => string.Equals(u.Login, req.Login.Trim(), StringComparison.OrdinalIgnoreCase)))) return Results.Conflict(new { message = "이미 사용 중인 아이디입니다." });
      var a = new Account { Id=Guid.NewGuid().ToString("N"), Login=req.Login.Trim(), Name=req.Name.Trim(), Role=req.Role, Active=req.Active, Assignments=(req.Assignments ?? []).Distinct().ToList() }; a.PasswordHash=store.Hash(a,req.Password);
      store.Change(s => { s.Users.Add(a); AppStore.Audit(s,Actor(ctx),"create","user",a.Id,null,PublicUser(a)); return 0; }); return Results.Ok(PublicUser(a));
    }
});
app.MapPost("/api/admin/users/{id}", (HttpContext ctx, string id, UserRequest req) => {
    if (string.IsNullOrWhiteSpace(req.Name) || req.Role is not ("ADMIN" or "WORKER" or "VIEWER") || (!string.IsNullOrEmpty(req.Password) && req.Password.Length < 12)) return Results.BadRequest(new { message = "이름, 역할 또는 비밀번호를 확인하세요." });
    lock(cacheLock) {
      var ids=LoadData()["work_orders"].Select(r=>r.GetValueOrDefault("work_order_id")?.ToString()).ToHashSet();
      if ((req.Assignments ?? []).Any(x=>!ids.Contains(x))) return Results.BadRequest(new { message = "존재하지 않는 작업 배정입니다." });
      var current=store.Read(s=>s.Users.FirstOrDefault(u=>u.Id==id)); if(current is null)return Results.NotFound();
      if(current.Role=="ADMIN" && current.Active && (!req.Active || req.Role!="ADMIN") && store.Read(s=>s.Users.Count(u=>u.Active&&u.Role=="ADMIN"))<=1)return Results.BadRequest(new { message="마지막 활성 관리자 계정은 변경할 수 없습니다." });
      store.Change(s=>{var u=s.Users.Single(x=>x.Id==id);var before=PublicUser(u);var passwordChanged=!string.IsNullOrEmpty(req.Password);if(u.Role!=req.Role || u.Active!=req.Active || passwordChanged)u.SessionVersion++;u.Name=req.Name.Trim();u.Role=req.Role;u.Active=req.Active;u.Assignments=(req.Assignments??[]).Distinct().ToList();if(passwordChanged)u.PasswordHash=store.Hash(u,req.Password);AppStore.Audit(s,Actor(ctx),"update","user",u.Id,before,new {user=PublicUser(u),passwordChanged});return 0;});return Results.Ok();
    }
});

app.MapGet("/api/health", () =>
{
    var data = LoadData();
    var asOf = data["equipment_snapshot"].Select(row => row.GetValueOrDefault("as_of")?.ToString()).Max();
    return Results.Ok(new { status = "ok", source = store.Read(s => s.Data is not null ? "app-state.json" : s.Mode == "legacy" && File.Exists(localDataPath) ? "local-data.json" : File.Exists(workbookPath) ? Path.GetFileName(workbookPath) : "empty"), asOf, tables = data.ToDictionary(item => item.Key, item => item.Value.Count) });
});

app.MapGet("/api/data", () => Results.Ok(LoadData()));
app.MapGet("/api/data/status", () =>
{
    var data = LoadData();
    return Results.Ok(new { mode = store.Read(s => s.Data is not null || s.Mode == "legacy" && File.Exists(localDataPath) ? "local" : File.Exists(workbookPath) ? "sample" : "empty"), ready = Ready(data), requiredTables, counts = data.ToDictionary(item => item.Key, item => item.Value.Count) });
});
app.MapGet("/api/spec", () => File.Exists(specificationPath) ? Results.Ok(LoadSpec()) : Results.NotFound(new { message = "항목 명세 파일이 없습니다." }));
app.MapPost("/api/data/reset", (HttpContext ctx) =>
{
    lock (cacheLock)
    {
        SaveData(tables.ToDictionary(table => table, _ => new List<Dictionary<string, object?>>()), Actor(ctx), "reset", LoadData());
    }
    return Results.Ok(new { reset = true });
});
app.MapPost("/api/data/restore-sample", (HttpContext ctx) =>
{
    lock (cacheLock)
    {
        var before = LoadData();
        if (!File.Exists(workbookPath)) return Results.BadRequest(new { message = "샘플 파일이 없습니다." });
        cached = null; cachedSource = null;
        Dictionary<string, List<Dictionary<string, object?>>> sample;
        using (var book = new XLWorkbook(workbookPath)) {
          sample = tables.ToDictionary(t => t, t => { var range = book.Worksheet(t).RangeUsed(); if (range is null) return new List<Dictionary<string, object?>>(); var headers = range.FirstRow().Cells().Select(c => c.GetString().Trim()).ToArray(); return range.RowsUsed().Skip(1).Select(row => { var item = new Dictionary<string, object?>(); for (int i=0;i<headers.Length;i++) { var cell=row.Cell(i+1); if(headers[i].Length==0 || cell.IsEmpty()) continue; item[headers[i]]=cell.DataType switch { XLDataType.DateTime => cell.GetDateTime().ToString("yyyy-MM-ddTHH:mm", CultureInfo.InvariantCulture), XLDataType.Number => cell.GetDouble(), XLDataType.Boolean => cell.GetBoolean(), _ => cell.GetString() }; } return item; }).Where(row => row.Count>0).ToList(); });
        }
        SaveData(sample, Actor(ctx), "restore-sample", before);
    }
    return Results.Ok(new { restored = true });
});
IResult Upload(HttpContext ctx, UploadRequest request, string? replaceId = null, Dictionary<string, List<Dictionary<string, object?>>>? workingData = null, bool persist = true)
{
    lock (cacheLock)
    {
        var spec = LoadSpec();
        if (!spec.TryGetValue(request.Table, out var fields)) return Results.BadRequest(new UploadFailure([new UploadError(1, "—", "테이블", "알 수 없는 대상 테이블입니다.")]));
        var errors = new List<UploadError>();
        void Error(int row, string field, string rule, string message) => errors.Add(new UploadError(row, field, rule, message));
        var expected = fields.Select(field => field.Field).ToHashSet();
        foreach (var field in fields.Where(field => !request.Headers.Contains(field.Field))) Error(1, field.Field, "헤더", "필드 없음");
        foreach (var header in request.Headers.Where(header => !expected.Contains(header))) Error(1, header, "헤더", "명세에 없는 필드");
        foreach (var header in request.Headers.GroupBy(x => x).Where(g => g.Count() > 1)) Error(1, header.Key, "헤더", "필드명 중복");
        for (var i=0; i<request.Rows.Count; i++) foreach (var key in request.Rows[i].Keys.Where(k=>!expected.Contains(k))) Error(i+2,key,"필드","명세에 없는 필드");
        if (request.Rows.Count == 0) Error(1, "—", "행", "적재할 데이터 행이 없습니다.");
        if (errors.Count > 0) return Results.BadRequest(new UploadFailure(errors));
        var data = workingData ?? LoadData().ToDictionary(item => item.Key, item => item.Value.Select(row => new Dictionary<string, object?>(row)).ToList());
        var pk = fields.FirstOrDefault(field => field.Key.Contains("PK", StringComparison.OrdinalIgnoreCase))?.Field;
        var original = data[request.Table].ToList();
        if (replaceId is not null) {
          if (pk is null || request.Rows.Count != 1 || request.Rows[0].GetValueOrDefault(pk)?.Trim() != replaceId) return Results.BadRequest(new { message = "수정할 식별자를 확인하세요." });
          var existing = data[request.Table].FirstOrDefault(r => r.GetValueOrDefault(pk)?.ToString() == replaceId);
          if (existing is null) return Results.NotFound();
          var account=(Account)ctx.Items["account"]!; var previousWork=existing.GetValueOrDefault("work_order_id")?.ToString();
          if (previousWork != request.Rows[0].GetValueOrDefault("work_order_id")?.Trim() || (account.Role!="ADMIN" && !account.Assignments.Contains(previousWork ?? ""))) return Results.StatusCode(403);
          data[request.Table].Remove(existing);
        }
        var seen = new HashSet<string>();
        var converted = new List<Dictionary<string, object?>>();
        for (var index = 0; index < request.Rows.Count; index++)
        {
            var input = request.Rows[index];
            var output = new Dictionary<string, object?>();
            foreach (var field in fields)
            {
                var value = input.GetValueOrDefault(field.Field)?.Trim() ?? "";
                if (value.Length == 0)
                {
                    if (field.Required) Error(index + 2, field.Field, "필수값", "값 없음");
                    continue;
                }
                if (field.Type.Contains("INTEGER", StringComparison.OrdinalIgnoreCase))
                {
                    if (long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number)) output[field.Field] = number;
                    else Error(index + 2, field.Field, "자료형", "정수가 아님");
                }
                else if (field.Type.Contains("REAL", StringComparison.OrdinalIgnoreCase))
                {
                    if (double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) && double.IsFinite(number)) output[field.Field] = number;
                    else Error(index + 2, field.Field, "자료형", "숫자가 아님");
                }
                else if (field.Field.EndsWith("_at", StringComparison.Ordinal))
                {
                    if (Regex.IsMatch(value, @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?\+09:00$") && DateTimeOffset.TryParse(value, out _)) output[field.Field] = value;
                    else Error(index + 2, field.Field, "시간 형식", "ISO 8601 +09:00 형식이 아님");
                }
                else if (field.Field == "plan_date")
                {
                    if (DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) output[field.Field] = value;
                    else Error(index + 2, field.Field, "날짜 형식", "yyyy-MM-dd 형식의 날짜가 아님");
                }
                else output[field.Field] = value;
                var fk = Regex.Match(field.Key, @"FK ([a-z_]+)\.([a-z_]+)");
                if (fk.Success)
                {
                    var targetTable = fk.Groups[1].Value;
                    var targetField = fk.Groups[2].Value;
                    var existing = data.GetValueOrDefault(targetTable)?.Any(row => Convert.ToString(row.GetValueOrDefault(targetField), CultureInfo.InvariantCulture) == value) ?? false;
                    var sameBatch = targetTable == request.Table && request.Rows.Any(row => row.GetValueOrDefault(targetField) == value);
                    if (!existing && !sameBatch) Error(index + 2, field.Field, "참조", $"{targetTable}에 {value} 없음");
                }
            }
            if (pk is not null && input.TryGetValue(pk, out var id) && !string.IsNullOrWhiteSpace(id))
            {
                if (!seen.Add(id)) Error(index + 2, pk, "식별자", "파일 안에서 키 중복");
                if (data[request.Table].Any(row => Convert.ToString(row.GetValueOrDefault(pk), CultureInfo.InvariantCulture) == id)) Error(index + 2, pk, "식별자", "이미 적재된 키");
            }
            converted.Add(output);
        }
        for (var index=0; index<request.Rows.Count; index++) {
          var o=request.Rows[index]; int row=index+2; string Get(string k)=>o.GetValueOrDefault(k)?.Trim() ?? "";
          foreach(var (start,end) in new[]{("planned_start_at","planned_end_at"),("actual_start_at","actual_end_at"),("period_start_at","period_end_at"),("start_at","end_at"),("opened_at","resolved_at")})
            if(DateTimeOffset.TryParse(Get(start),out var a) && DateTimeOffset.TryParse(Get(end),out var b) && a>b) Error(row,end,"시간 순서",$"{start}보다 빠름");
          var domains=new Dictionary<string,(string,string)> { ["work_orders"]=("status","work_order"), ["equipment_intervals"]=("status","equipment"), ["equipment_snapshot"]=("status","equipment"), ["incidents"]=("status","incident"), ["inspections"]=("result","inspection"), ["rework"]=("status","rework") };
          if(domains.TryGetValue(request.Table,out var sd) && Get(sd.Item1).Length>0 && !data["status_codes"].Any(x=>x.GetValueOrDefault("code_id")?.ToString()==sd.Item2+":"+Get(sd.Item1))) Error(row,sd.Item1,"상태코드","정의되지 않은 상태");
          if(request.Table=="incidents" && Get("category").Length>0 && !new[]{"EQUIPMENT","MATERIAL","QUALITY"}.Contains(Get("category"))) Error(row,"category","상태코드","정의되지 않은 사건 유형");
          if(request.Table=="incidents" && Get("status")=="OPEN" && Get("resolved_at").Length>0) Error(row,"resolved_at","상태","OPEN 사건에 해소시각이 있습니다.");
          if(request.Table=="work_history" && Get("event_type").Length>0 && !new[]{"START","COMPLETE","PAUSE","RESUME","QUALITY_HOLD","REWORK_DONE"}.Contains(Get("event_type"))) Error(row,"event_type","상태코드","정의되지 않은 이벤트");
          if(request.Table=="production_actual" && double.TryParse(Get("accepted_qty_delta"),NumberStyles.Float,CultureInfo.InvariantCulture,out var qty) && qty<0) Error(row,"accepted_qty_delta","수량","음수 증분");
          if(request.Table=="inspections" && long.TryParse(Get("checked_points"),out var n) && long.TryParse(Get("passed_points"),out var pass) && long.TryParse(Get("failed_points"),out var fail) && (n<0 || pass<0 || fail<0 || pass+fail!=n)) Error(row,"checked_points","수량","검사 위치 수와 합격·불합격 수를 확인하세요.");
          if(request.Table=="production_plan" && Get("work_order_id").Length>0 && (data["production_plan"].Any(p=>p.GetValueOrDefault("work_order_id")?.ToString()==Get("work_order_id")) || request.Rows.Count(r=>r.GetValueOrDefault("work_order_id")?.Trim()==Get("work_order_id"))>1)) Error(row,"work_order_id","식별자","작업지시당 계획은 1건입니다.");
          if(request.Table is "production_plan" or "production_actual" or "work_orders") { var target=request.Table=="work_orders"?"processes":"work_orders";var key=request.Table=="work_orders"?"process_id":"work_order_id";var linked=data[target].FirstOrDefault(x=>x.GetValueOrDefault(key)?.ToString()==Get(key)); if(linked is not null && Get("unit").Length>0 && linked.GetValueOrDefault("unit")?.ToString()!=Get("unit")) Error(row,"unit","단위","연결된 작업 또는 공정의 단위와 다릅니다."); }
        }
        if (request.Table == "production_actual") {
          // Different identifiers must not duplicate the same observed increment.
          // Compare equivalent timestamp/quantity representations as values.
          var seenActuals = new HashSet<(string Work, DateTimeOffset Start, DateTimeOffset End, decimal Qty, string Unit)>();
          bool ActualTime(object? value, out DateTimeOffset parsed) {
            var text=value?.ToString() ?? "";
            if (!Regex.IsMatch(text, @"(?:Z|[+-]\d{2}:\d{2})$", RegexOptions.IgnoreCase)) text += "+09:00";
            return DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out parsed);
          }
          (string, DateTimeOffset, DateTimeOffset, decimal, string)? ActualKey(Dictionary<string, object?> row) {
            var work = row.GetValueOrDefault("work_order_id")?.ToString()?.Trim();
            var unit = row.GetValueOrDefault("unit")?.ToString()?.Trim();
            if (string.IsNullOrEmpty(work) || string.IsNullOrEmpty(unit) ||
                !ActualTime(row.GetValueOrDefault("period_start_at"), out var start) ||
                !ActualTime(row.GetValueOrDefault("period_end_at"), out var end) ||
                !decimal.TryParse(Convert.ToString(row.GetValueOrDefault("accepted_qty_delta"), CultureInfo.InvariantCulture), NumberStyles.Float, CultureInfo.InvariantCulture, out var qty)) return null;
            return (work, start, end, qty, unit);
          }
          foreach (var row in data[request.Table]) { var key = ActualKey(row); if (key.HasValue) seenActuals.Add(key.Value); }
          for (var index=0; index<converted.Count; index++) { var key=ActualKey(converted[index]); if (key.HasValue && !seenActuals.Add(key.Value)) Error(index+2,"actual_id","중복 실적","같은 작업·집계 구간·수량·단위의 실적이 이미 있습니다."); }
        }
        if (errors.Count > 0) return Results.BadRequest(new UploadFailure(errors));
        data[request.Table].AddRange(converted);
        if (persist) SaveData(data, Actor(ctx), (replaceId is null ? "upload:" : "update:") + request.Table, original);
        return Results.Ok(new { table = request.Table, added = converted.Count, total = data[request.Table].Count, ready = Ready(data) });
    }
}
app.MapPost("/api/data/upload", (HttpContext ctx, UploadRequest request) => Upload(ctx, request));
IResult UploadBatch(HttpContext ctx, BatchRequest batch, bool persist)
{
    lock (cacheLock) {
        if (batch.Files is null || batch.Files.Count == 0 || batch.Files.Count > 100)
            return Results.BadRequest(new { message = "CSV 파일을 1~100개 선택하세요." });
        if (batch.Files.Any(f => f is null || string.IsNullOrWhiteSpace(f.Name) || f.Headers is null || f.Rows is null || !tables.Contains(f.Table)))
            return Results.BadRequest(new { message = "파일명, 테이블, 헤더 및 행을 확인하세요." });
        var spec = LoadSpec();
        var allErrors = new List<BatchUploadError>();
        foreach (var file in batch.Files) {
            var expected=spec[file.Table].Select(x=>x.Field).ToHashSet();
            foreach (var h in expected.Where(x=>!file.Headers.Contains(x))) allErrors.Add(new(file.Name,file.Table,1,h,"헤더","필드 없음"));
            foreach (var h in file.Headers.Where(x=>!expected.Contains(x))) allErrors.Add(new(file.Name,file.Table,1,h,"헤더","명세에 없는 필드"));
            foreach (var h in file.Headers.GroupBy(x=>x).Where(g=>g.Count()>1)) allErrors.Add(new(file.Name,file.Table,1,h.Key,"헤더","필드명 중복"));
            if(file.Rows.Count==0) allErrors.Add(new(file.Name,file.Table,1,"—","행","적재할 데이터 행이 없습니다."));
        }
        if(allErrors.Count>0)return Results.BadRequest(new { errors=allErrors });
        var data=LoadData().ToDictionary(x=>x.Key,x=>x.Value.Select(r=>new Dictionary<string,object?>(r)).ToList());
        var before=data.ToDictionary(x=>x.Key,x=>x.Value.ToList());
        var order=new[]{"vessels","zones","processes","equipment","blocks","status_codes","work_orders","production_plan","production_actual","incidents","equipment_intervals","work_history","inspections","rework","equipment_snapshot"};
        var results=new List<object>();
        foreach(var table in order) {
            var files=batch.Files.Where(f=>f.Table==table).ToList(); if(files.Count==0)continue;
            var rows=files.SelectMany(f=>f.Rows).ToList();
            var rowOwners=files.SelectMany(f=>f.Rows.Select((_,i)=>(f.Name,Row:i+2))).ToList();
            var request=new UploadRequest(table,files[0].Headers,rows);
            var result=Upload(ctx,request,workingData:data,persist:false);
            if(result is Microsoft.AspNetCore.Http.IStatusCodeHttpResult status && status.StatusCode>=400) {
                var failure=(result as Microsoft.AspNetCore.Http.IValueHttpResult)?.Value as UploadFailure;
                foreach(var error in failure?.Errors ?? [new UploadError(1,"—","서버","검증 요청이 거부되었습니다.")]) {
                    var owner=error.Row>=2 && error.Row-2<rowOwners.Count ? rowOwners[error.Row-2] : (files[0].Name,1);
                    allErrors.Add(new(owner.Item1,table,owner.Item2,error.Field,error.Rule,error.Msg));
                }
            } else results.Add(new { table, files=files.Count, added=rows.Count });
        }
        if(allErrors.Count>0)return Results.BadRequest(new { errors=allErrors });
        if(persist)SaveData(data,Actor(ctx),"upload:batch",before);
        return Results.Ok(new { files=batch.Files.Count, results, ready=Ready(data), saved=persist });
    }
}
app.MapPost("/api/data/batch/validate", (HttpContext ctx, BatchRequest batch) => UploadBatch(ctx,batch,false));
app.MapPost("/api/data/batch", (HttpContext ctx, BatchRequest batch) => UploadBatch(ctx,batch,true));
app.MapPost("/api/work/entry", (HttpContext ctx, WorkEntryRequest req) => {
    var user=(Account)ctx.Items["account"]!;
    if(req.Table is not ("production_actual" or "incidents") || req.Row is null) return Results.BadRequest(new { message="실적 또는 사건만 등록할 수 있습니다." });
    var workId=req.Row.GetValueOrDefault("work_order_id")?.Trim();
    if(string.IsNullOrEmpty(workId) || (user.Role!="ADMIN" && !user.Assignments.Contains(workId))) return Results.StatusCode(403);
    var spec=LoadSpec(); var fields=spec[req.Table].Select(x=>x.Field).ToList();
    if(req.Row.Keys.Any(k=>!fields.Contains(k))) return Results.BadRequest(new { message="알 수 없는 필드가 있습니다." });
    return Upload(ctx, new UploadRequest(req.Table, fields, [req.Row]), req.Id);
});
app.MapGet("/api/summary/ai", () => Results.Ok(new { enabled = false, text = (string?)null }));

app.Run();

record FieldSpec(string Field, string Label, string Type, bool Required, string Key);
record UploadRequest(string Table, List<string> Headers, List<Dictionary<string, string>> Rows);
record UploadError(int Row, string Field, string Rule, string Msg);
record UploadFailure(List<UploadError> Errors);
record BatchFile(string Name, string Table, List<string> Headers, List<Dictionary<string,string>> Rows);
record BatchRequest(List<BatchFile> Files);
record BatchUploadError(string File, string Table, int Row, string Field, string Rule, string Msg);

