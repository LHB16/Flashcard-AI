using System.Collections.Generic;

namespace FlashcardAI.Models;

public class AppSettings
{
    public List<string> ApiKeys { get; set; } = new();
    public List<string>? ActiveKeys { get; set; }
    public string Theme { get; set; } = "dark";
    public string QuizletFormat { get; set; } = "full";
}
