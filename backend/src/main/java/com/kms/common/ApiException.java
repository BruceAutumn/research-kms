package com.kms.common;

import org.springframework.http.HttpStatus;

import java.util.LinkedHashMap;
import java.util.Map;

public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final Map<String, Object> extra;

    public ApiException(HttpStatus status, String message) {
        this(status, message, Map.of());
    }

    /** 附带结构化字段（如保存冲突时的 serverContent / serverMtime）。 */
    public ApiException(HttpStatus status, String message, Map<String, Object> extra) {
        super(message);
        this.status = status;
        this.extra = new LinkedHashMap<>(extra);
    }

    public HttpStatus getStatus() {
        return status;
    }

    public Map<String, Object> getExtra() {
        return extra;
    }
}
