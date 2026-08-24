package com.kms.vault;

import com.kms.common.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Attachment write whitelist test. 
 *
 * this time for multimodalVault,   Attachments/  Writable extensions from"Image + PDF"
 * Extended to"Image / PDF / Audio / Video". Whitelist is security boundary, after relaxMusthas test
 * pin"relax until"--else next time may become blacklistNamesingle. 
 *
 * Run: cd backend && mvn -q test -Dtest=AttachmentWhitelistTest
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
        assertDoesNotThrow(() -> resolver.resolveForWrite(relPath), relPath + " Should allow write");
    }

    private void assertRejected(String relPath) {
        ApiException ex = assertThrows(ApiException.class,
                () -> resolver.resolveForWrite(relPath), relPath + " Should be rejected");
        assertEquals(403, ex.getStatus().value(), relPath + " Should return 403");
    }

    // ---------- allow ----------

    @Test
    void allowsImagesUnderAttachments() {
        for (String ext : new String[]{".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif"}) {
            assertWritable("Attachments/figure" + ext);
        }
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

    // ---------- reject ----------

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

    /** Key: media type only Attachments/ lowerLine, cannot rely on changingDirectoryNamejust write elsewhere.  */
    @Test
    void rejectsMediaOutsideAttachments() {
        assertRejected("figure.png");
        assertRejected("SomeFolder/figure.png");
        assertRejected("attachments/figure.png"); // Case-insensitive dir name match
    }

    /** Double extension cannot bypass: Last extension wins.  */
    @Test
    void rejectsDoubleExtensionBypass() {
        assertRejected("Attachments/evil.png.sh");
        assertWritable("Attachments/evil.sh.png");
    }
}
