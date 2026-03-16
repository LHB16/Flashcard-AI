using System;
using System.Collections.Generic;
using System.IO;
using OpenCvSharp;

namespace FlashcardAI.Services;

public class VideoService
{
    /// <summary>
    /// Trích xuất ảnh từ video với cấu hình FPS (mặc định lấy 1 ảnh mỗi giây).
    /// </summary>
    public static List<string> ExtractFrames(string videoPath, string outputDir, int fps = 1, Action<string>? onLog = null)
    {
        var extractedFiles = new List<string>();
        if (!Directory.Exists(outputDir))
        {
            Directory.CreateDirectory(outputDir);
        }
        
        using var capture = new VideoCapture(videoPath);
        if (!capture.IsOpened())
        {
            throw new Exception("Unable to open video: " + videoPath);
        }
            
        double originalFps = capture.Fps;
        if (originalFps <= 0) originalFps = 30; // fallback
        
        int frameInterval = (int)Math.Max(1, Math.Round(originalFps / fps));
        
        onLog?.Invoke($"Extracting 1 frame per {fps} sec from {Path.GetFileName(videoPath)} (Orig FPS: {originalFps:F1})...");
        
        int frameCount = 0;
        int savedCount = 0;
        using var frame = new Mat();
        
        while (capture.Read(frame))
        {
            if (frame.Empty()) break;
            
            if (frameCount % frameInterval == 0)
            {
                string filename = Path.Combine(outputDir, $"frame_{savedCount:D4}.jpg");
                Cv2.ImWrite(filename, frame);
                extractedFiles.Add(filename);
                savedCount++;
            }
            frameCount++;
        }
        
        onLog?.Invoke($"✔ Extracted {savedCount} frames to temporary folder.");
        return extractedFiles;
    }
}
