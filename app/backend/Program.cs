using ClosedXML.Excel;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
var root = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", ".."));
var workbookPath = Path.Combine(root, "엑셀 파일", "02_조선_샘플데이터.xlsx");
var specificationPath = Path.Combine(root, "엑셀 파일", "01_조선_데이터참고명세서.xlsx");
var localDataPath = Path.Combine(root, "app", "backend", "local-data.json");
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
        var source = File.Exists(localDataPath) ? localDataPath : workbookPath;
        if (!File.Exists(source)) throw new FileNotFoundException("데이터 파일을 찾을 수 없습니다.", source);
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

void SaveData(Dictionary<string, List<Dictionary<string, object?>>> data)
{
    var temp = localDataPath + ".tmp";
    File.WriteAllText(temp, JsonSerializer.Serialize(data));
    File.Move(temp, localDataPath, true);
    cached = data;
    cachedWrite = File.GetLastWriteTimeUtc(localDataPath);
    cachedSource = localDataPath;
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

app.MapGet("/api/health", () =>
{
    var data = LoadData();
    var asOf = data["equipment_snapshot"].Select(row => row.GetValueOrDefault("as_of")?.ToString()).Max();
    return Results.Ok(new { status = "ok", source = File.Exists(localDataPath) ? "local-data.json" : Path.GetFileName(workbookPath), asOf, tables = data.ToDictionary(item => item.Key, item => item.Value.Count) });
});

app.MapGet("/api/data", () => Results.Ok(LoadData()));
app.MapGet("/api/data/status", () =>
{
    var data = LoadData();
    return Results.Ok(new { mode = File.Exists(localDataPath) ? "local" : "sample", ready = Ready(data), requiredTables, counts = data.ToDictionary(item => item.Key, item => item.Value.Count) });
});
app.MapGet("/api/spec", () => Results.Ok(LoadSpec()));
app.MapPost("/api/data/reset", () =>
{
    lock (cacheLock)
    {
        SaveData(tables.ToDictionary(table => table, _ => new List<Dictionary<string, object?>>()));
    }
    return Results.Ok(new { reset = true });
});
app.MapPost("/api/data/restore-sample", () =>
{
    lock (cacheLock)
    {
        if (File.Exists(localDataPath)) File.Delete(localDataPath);
        cached = null;
        cachedSource = null;
    }
    return Results.Ok(new { restored = true });
});
app.MapPost("/api/data/upload", (UploadRequest request) =>
{
    lock (cacheLock)
    {
        var spec = LoadSpec();
        if (!spec.TryGetValue(request.Table, out var fields)) return Results.BadRequest(new { errors = new[] { new UploadError(1, "—", "테이블", "알 수 없는 대상 테이블입니다.") } });
        var errors = new List<UploadError>();
        void Error(int row, string field, string rule, string message) => errors.Add(new UploadError(row, field, rule, message));
        var expected = fields.Select(field => field.Field).ToHashSet();
        foreach (var field in fields.Where(field => !request.Headers.Contains(field.Field))) Error(1, field.Field, "헤더", "필드 없음");
        foreach (var header in request.Headers.Where(header => !expected.Contains(header))) Error(1, header, "헤더", "명세에 없는 필드");
        if (request.Rows.Count == 0) Error(1, "—", "행", "적재할 데이터 행이 없습니다.");
        if (errors.Count > 0) return Results.BadRequest(new { errors });
        var data = LoadData().ToDictionary(item => item.Key, item => item.Value.Select(row => new Dictionary<string, object?>(row)).ToList());
        var pk = fields.FirstOrDefault(field => field.Key.Contains("PK", StringComparison.OrdinalIgnoreCase))?.Field;
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
                    if (double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number)) output[field.Field] = number;
                    else Error(index + 2, field.Field, "자료형", "숫자가 아님");
                }
                else if (field.Field.EndsWith("_at", StringComparison.Ordinal))
                {
                    if (Regex.IsMatch(value, @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?\+09:00$") && DateTimeOffset.TryParse(value, out _)) output[field.Field] = value[..16];
                    else Error(index + 2, field.Field, "시간 형식", "ISO 8601 +09:00 형식이 아님");
                }
                else output[field.Field] = value;
                var fk = Regex.Match(field.Key, @"FK ([a-z_]+)\.([a-z_]+)");
                if (fk.Success && !field.Key.Contains("PK", StringComparison.OrdinalIgnoreCase))
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
        if (errors.Count > 0) return Results.BadRequest(new { errors });
        data[request.Table].AddRange(converted);
        SaveData(data);
        return Results.Ok(new { table = request.Table, added = converted.Count, total = data[request.Table].Count, ready = Ready(data) });
    }
});
app.MapGet("/api/summary/ai", () => Results.Ok(new { enabled = false, text = (string?)null }));

app.Run();

record FieldSpec(string Field, string Label, string Type, bool Required, string Key);
record UploadRequest(string Table, List<string> Headers, List<Dictionary<string, string>> Rows);
record UploadError(int Row, string Field, string Rule, string Msg);
