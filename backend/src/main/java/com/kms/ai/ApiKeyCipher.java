package com.kms.ai;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.Set;

@Component
public class ApiKeyCipher {
    private static final Logger log = LoggerFactory.getLogger(ApiKeyCipher.class);
    private static final int KEY_BYTES = 32;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecureRandom random = new SecureRandom();
    private SecretKeySpec keySpec;

    @PostConstruct
    public void init() {
        byte[] key = loadOrCreateKey();
        if (key.length != KEY_BYTES) {
            key = sha256(key);
        }
        this.keySpec = new SecretKeySpec(key, "AES");
    }

    public String encrypt(String plaintext) {
        if (plaintext == null || plaintext.isBlank()) {
            return null;
        }
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, new GCMParameterSpec(TAG_BITS, iv));
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(iv) + ":" + Base64.getEncoder().encodeToString(encrypted);
        } catch (Exception ex) {
            throw new IllegalStateException("API Key Encryption failed. ", ex);
        }
    }

    public String decrypt(String encrypted) {
        if (encrypted == null || encrypted.isBlank()) {
            return null;
        }
        try {
            String[] parts = encrypted.split(":", 2);
            if (parts.length != 2) {
                throw new IllegalArgumentException("Ciphertext format invalid. ");
            }
            byte[] iv = Base64.getDecoder().decode(parts[0]);
            byte[] ciphertext = Base64.getDecoder().decode(parts[1]);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, keySpec, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception ex) {
            throw new IllegalStateException("API Key Decryption failed. ", ex);
        }
    }

    private byte[] loadOrCreateKey() {
        String env = System.getenv("KMS_SECRET_KEY");
        if (env != null && !env.isBlank()) {
            byte[] decoded = tryDecodeBase64(env.trim());
            return decoded == null ? env.getBytes(StandardCharsets.UTF_8) : decoded;
        }
        Path path = Path.of(System.getProperty("user.home"), ".kms", "secret.key");
        try {
            if (Files.exists(path)) {
                byte[] decoded = tryDecodeBase64(Files.readString(path, StandardCharsets.UTF_8).trim());
                if (decoded != null) {
                    log.info("KMS_SECRET_KEY notSettings, Use local key file: {}", path);
                    return decoded;
                }
            }
            Files.createDirectories(path.getParent());
            byte[] key = new byte[KEY_BYTES];
            random.nextBytes(key);
            Files.writeString(path, Base64.getEncoder().encodeToString(key), StandardCharsets.UTF_8);
            setOwnerOnly(path);
            log.warn("KMS_SECRET_KEY notSettings, Local key file generated: {}. Please back up the file; Will not print key content. ", path);
            return key;
        } catch (IOException ex) {
            throw new IllegalStateException("cannotReadorGenerate KMS secret key File. ", ex);
        }
    }

    private byte[] tryDecodeBase64(String value) {
        try {
            byte[] bytes = Base64.getDecoder().decode(value);
            return bytes.length == 16 || bytes.length == 24 || bytes.length == 32 ? bytes : null;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private void setOwnerOnly(Path path) {
        try {
            Files.setPosixFilePermissions(path, Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE));
        } catch (UnsupportedOperationException | IOException ex) {
            log.warn("cannotSettings {} as 0600, Please manually confirm permission. ", path);
        }
    }

    private byte[] sha256(byte[] value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value);
        } catch (Exception ex) {
            return Arrays.copyOf(value, KEY_BYTES);
        }
    }
}
