package com.kms.vault;

import com.kms.common.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/**
 * VaultPathResolver Path Security Unit Test. 
 * cover specAllmaliciousInput + normalPathregression. 
 * Run: cd backend && mvn -q test -Dtest=VaultPathResolverTest
 */
class VaultPathResolverTest {

    @TempDir
    Path tmp;

    Path root;
    VaultPathResolver resolver;

    @BeforeEach
    void setUp() throws Exception {
        root = tmp.resolve("vault");
        Files.createDirectories(root);
        Files.createDirectories(root.resolve("01-Projects"));
        Files.createDirectories(root.resolve("03-Concepts"));
        Files.createDirectories(root.resolve("Attachments"));
        Files.createDirectories(tmp.resolve("outside"));
        Files.writeString(tmp.resolve("outside").resolve("secret.txt"), "outside");
        resolver = new VaultPathResolver(root.toRealPath());
    }

    // ---------- normalPathregression ----------

    @Test
    void resolvesExistingNoteInsideRoot() throws Exception {
        Path file = root.resolve("01-Projects/a.md");
        Files.writeString(file, "hello");
        Path resolved = resolver.resolveExisting("01-Projects/a.md");
        assertEquals(file.toRealPath(), resolved);
    }

    @Test
    void resolvesNewFileInsideRoot() throws Exception {
        Path resolved = resolver.resolveForWrite("03-Concepts/new.md");
        assertTrue(resolved.startsWith(root.toRealPath()));
    }

    @Test
    void resolvesAttachmentPdfUnderAttachments() {
        Path resolved = resolver.resolveForWrite("Attachments/paper.pdf");
        assertEquals("paper.pdf", resolved.getFileName().toString());
    }

    // ---------- spec required maliciousInput ----------

    @Test
    void rejectsDotDotSlashEtcPasswd() {
        ApiException ex = assertThrows(ApiException.class, () -> resolver.resolveExisting("../../etc/passwd"));
        assertEquals(403, ex.getStatus().value());
    }

    @Test
    void rejectsAbsoluteEtcPasswd() {
        ApiException ex = assertThrows(ApiException.class, () -> resolver.resolveExisting("/etc/passwd"));
        assertEquals(403, ex.getStatus().value());
    }

    @Test
    void rejectsNormalizedTraversal() {
        ApiException ex = assertThrows(ApiException.class, () -> resolver.resolveExisting("a/../../b"));
        assertEquals(403, ex.getStatus().value());
    }

    @Test
    void rejectsUrlEncodedTraversal() {
        // Client/Proxy layer may %2e%2e%2f Pass as form: resolver Must reject directly. 
        ApiException encoded = assertThrows(ApiException.class,
                () -> resolver.resolveExisting("%2e%2e%2f%2e%2e%2fetc%2fpasswd"));
        assertEquals(403, encoded.getStatus().value());
        // Spring after decode arrive "../" Form also rejected
        ApiException decoded = assertThrows(ApiException.class,
                () -> resolver.resolveExisting("../../etc/passwd"));
        assertEquals(403, decoded.getStatus().value());
        // Mixed Form(..%2F..)
        ApiException mixed = assertThrows(ApiException.class,
                () -> resolver.resolveExisting("..%2F..%2Fetc%2Fpasswd"));
        assertEquals(403, mixed.getStatus().value());
    }

    @Test
    void rejectsSymlinkPointingOutside() throws Exception {
        Path link = root.resolve("evil.md");
        Files.createSymbolicLink(link, tmp.resolve("outside").resolve("secret.txt"));
        ApiException ex = assertThrows(ApiException.class, () -> resolver.resolveExisting("evil.md"));
        assertEquals(403, ex.getStatus().value());
        Files.deleteIfExists(link);
    }

    @Test
    void rejectsSymlinkDirPointingOutsideForNewFile() throws Exception {
        Path linkDir = root.resolve("linkdir");
        Files.createSymbolicLink(linkDir, tmp.resolve("outside"));
        ApiException ex = assertThrows(ApiException.class, () -> resolver.resolveForWrite("linkdir/new.md"));
        assertEquals(403, ex.getStatus().value());
        Files.deleteIfExists(linkDir);
    }

    // ---------- extra security item ----------

    @Test
    void rejectsWindowsStyleAbsolutePath() {
        ApiException ex = assertThrows(ApiException.class, () -> resolver.resolveExisting("C:\\Users\\x.txt"));
        assertEquals(403, ex.getStatus().value());
    }

    @Test
    void rejectsEmptyAndBlankPath() {
        assertThrows(ApiException.class, () -> resolver.resolveExisting(null));
        assertThrows(ApiException.class, () -> resolver.resolveExisting("   "));
    }

    @Test
    void rejectsNonWhitelistedExtensionForWrite() {
        ApiException ex = assertThrows(ApiException.class, () -> resolver.resolveForWrite("evil.sh"));
        assertEquals(403, ex.getStatus().value());
        ApiException ex2 = assertThrows(ApiException.class, () -> resolver.resolveForWrite("Attachments/virus.exe"));
        assertEquals(403, ex2.getStatus().value());
    }

    @Test
    void toRelativeRoundTrips() {
        String rel = "01-Projects/subDirectory/Note.md";
        assertEquals(rel, resolver.toRelative(resolver.resolveForWrite(rel)));
    }
}
