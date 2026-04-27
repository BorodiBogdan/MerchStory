namespace DataIngestion;

// Mirrors one entry inside playbook/{domain}/playbook.yaml.
// Entries are stored in English; Strategist writes output in the user's
// language regardless of source-material language.
public class PlaybookYamlEntry
{
    public string Theme { get; set; } = string.Empty;

    // weather | holiday | news | seasonal
    public string TriggerType { get; set; } = string.Empty;

    public string Trigger { get; set; } = string.Empty;

    public string Tactics { get; set; } = string.Empty;

    public string ExampleCopy { get; set; } = string.Empty;
}
