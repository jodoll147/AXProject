using System.Globalization;
using System.Text.Json;

sealed record ZonePosition(string ZoneId, double X, double Y, double PreviousX, double PreviousY);
sealed record LayoutRequest(List<ZonePosition>? Zones);
static class LayoutCoordinates
{
    public static double Coordinate(object? value) => Convert.ToDouble(value is JsonElement e ? e.GetDouble() : value, CultureInfo.InvariantCulture);
    // Limit the conceptual drawing extent, including its ruler, to a usable canvas.
    public const double Limit = 10000;
    public static string? Validate(List<ZonePosition>? changes, List<Dictionary<string, object?>> zones)
    {
        if (changes is null || changes.Count == 0 || changes.Count > zones.Count) return "변경할 구역을 확인하세요.";
        if (changes.Select(z => z.ZoneId).Distinct().Count() != changes.Count) return "중복 구역은 저장할 수 없습니다.";
        foreach (var z in changes)
        {
            if (!zones.Any(row => Equals(row.GetValueOrDefault("zone_id")?.ToString(), z.ZoneId))) return "존재하지 않는 구역입니다.";
            if (new[] { z.X, z.Y, z.PreviousX, z.PreviousY }.Any(v => !double.IsFinite(v) || Math.Abs(v) > Limit)) return "좌표는 -10000 ~ 10000 사이의 유한한 숫자여야 합니다.";
        }
        return null;
    }
}
