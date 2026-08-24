package com.kms.common;

/**
 * v1 不做登录，所有数据都归属本地用户 id=1。
 * 将来接入认证时，只需要把这里替换成从登录态读取用户 id 的逻辑。
 */
public final class CurrentUser {
    public static final Long ID = 1L;

    private CurrentUser() {
    }
}
