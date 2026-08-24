package com.kms.vault;

import com.kms.common.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 附件写入白名单测试。
 *
 * 这次为了支持多模态知识库，把 Attachments/ 的可写扩展名从「图片 + PDF」
 * 扩到了「图片 / PDF / 音频 / 视频」。白名单是安全边界，放宽之后必须有测试
 * 钉住「放宽到哪为止」——否则下次再加类型时很容易顺手改成黑名单。
 *
 * 运行：cd backend && mvn -q test -Dtest=AttachmentWhitelistTest
 */
class AttachmentWhitelistTest {

    @TempDir
    Path tmp;

    Path root;
    VaultPathResolver resolver;

    @BeforeEach
    void setUp() throws Exception {
        root = tmp.resolve("vault");
        Files.createDirectories(root.resolve("Attachments"));
        resolver = new VaultPathResolver(root.toRealPath());
    }

    private void assertWritable(String relPath) {
        assertDoesNotThrow(() -> resolver.resolveForWrite(relPath), relPath + " 应允许写入");
    }

    private void assertRejected(String relPath) {
        ApiException ex = assertThrows(ApiException.class,
                () -> resolver.resolveForWrite(relPath), relPath + " 应被拒绝");
        assertEquals(403, ex.getStatus().value(), relPath + " 应返回 403");
    }

    // ---------- 允许 ----------

    @Test
    void allowsImagesUnderAttachments() {
        for (String ext : new String[]{".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif"}) {
            assertWritable("Attachments/figure" + ext);
        }
    }

    /** SVG 可携带活动内容，同源内联会放大 XSS 风险，公开客户端不接收。 */
    @Test
    void rejectsActiveSvgAttachments() {
        assertRejected("Attachments/figure.svg");
    }

    @Test
    void allowsAudioAndVideoUnderAttachments() {
        for (String ext : new String[]{".mp3", ".wav", ".m4a", ".ogg", ".flac",
                                       ".mp4", ".webm", ".mov", ".m4v"}) {
            assertWritable("Attachments/recording" + ext);
        }
    }

    @Test
    void allowsPdfUnderAttachments() {
        assertWritable("Attachments/paper.pdf");
    }

    @Test
    void allowsMarkdownAndCanvasAnywhere() {
        assertWritable("note.md");
        assertWritable("Attachments/note.md");
        assertWritable("board.canvas");
    }

    // ---------- 拒绝 ----------

    @Test
    void rejectsExecutableExtensionsUnderAttachments() {
        for (String name : new String[]{"evil.sh", "evil.js", "evil.exe", "evil.bat",
                                        "evil.command", "evil.py", "evil.jar", "evil.dylib"}) {
            assertRejected("Attachments/" + name);
        }
    }

    @Test
    void rejectsExtensionlessFile() {
        assertRejected("Attachments/README");
    }

    /** 关键：媒体类型只在 Attachments/ 下放行，不能靠改个目录名就随便写到别处。 */
    @Test
    void rejectsMediaOutsideAttachments() {
        assertRejected("figure.png");
        assertRejected("SomeFolder/figure.png");
        assertRejected("attachments/figure.png"); // 目录名大小写不同也不行
    }

    /** 双扩展名不能绕过：最后一个扩展名说了算。 */
    @Test
    void rejectsDoubleExtensionBypass() {
        assertRejected("Attachments/evil.png.sh");
        assertWritable("Attachments/evil.sh.png");
    }
}
