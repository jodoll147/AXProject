using ClosedXML.Excel;
using System.Globalization;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
var root = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", ".."));
var workbookPath = Path.Combine(root, "엑셀 파일", "02_조선_샘플데이터.xlsx");
var tables = new[] { "vessels", "zones", "processes", "equipment", "blocks", "status_codes", "work_orders", "production_plan", "production_actual", "equipment_intervals", "incidents", "work_history", "inspections", "rework", "equipment_snapshot" };
var cacheLock = new object();
DateTime cachedWrite = DateTime.MinValue;
Dictionary<string, List<Dictionary<string, object?>>>? cached = null;

Dictionary<string, List<Dictionary<string, object?>>> LoadData()
{
    if (!File.Exists(workbookPath)) throw new FileNotFoundException("샘플 데이터 파일을 찾을 수 없습니다.", workbookPath);
    lock (cacheLock)
    {
        var write = File.GetLastWriteTimeUtc(workbookPath);
        if (cached is not null && write == cachedWrite) return cached;
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
        return result;
    }
}

app.MapGet("/api/health", () =>
{
    var data = LoadData();
    var asOf = data["equipment_snapshot"].Select(row => row.GetValueOrDefault("as_of")?.ToString()).Max();
    return Results.Ok(new { status = "ok", source = Path.GetFileName(workbookPath), asOf, tables = data.ToDictionary(item => item.Key, item => item.Value.Count) });
});

app.MapGet("/api/data", () => Results.Ok(LoadData()));
app.MapGet("/api/summary/ai", () => Results.Ok(new { enabled = false, text = (string?)null }));

app.Run();
