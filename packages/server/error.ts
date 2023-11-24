/* eslint-disable max-len */
/* eslint-disable func-names */

interface IHydroError {
    new(...args: any[]): HydroError
}

const Err = (name: string, Class: IHydroError, ...info: Array<(() => string) | string | number>) => {
    let msg: () => string;
    let code: number;
    for (const item of info) {
        if (typeof item === 'number') {
            code = item;
        } else if (typeof item === 'string') {
            msg = function () { return item; };
        } else if (typeof item === 'function') {
            msg = item;
        }
    }
    const HydroError = class extends Class { };
    HydroError.prototype.name = name;
    if (msg) HydroError.prototype.msg = msg;
    if (code) HydroError.prototype.code = code;
    return HydroError;
};

export class HydroError extends Error {
    params: any[];
    code: number;

    constructor(...params: any[]) {
        super();
        this.params = params;
    }

    msg() {
        return 'HydroError';
    }

    get message() {
        return this.msg();
    }
}

export const UserFacingError = Err('UserFacingError', HydroError, 'UserFacingError', 400);
export const SystemError = Err('SystemError', HydroError, 'SystemError', 500);

export const BadRequestError = Err('BadRequestError', UserFacingError, 'BadRequestError', 400);
export const ForbiddenError = Err('ForbiddenError', UserFacingError, 'ForbiddenError', 403);
export const NotFoundError = Err('NotFoundError', UserFacingError, 'NotFoundError', 404);
export const MethodNotAllowedError = Err('MethodNotAllowedError', UserFacingError, 'MethodNotAllowedError', 405);
export const NoPDFError = Err('NoPDFError', NotFoundError, 'The contest does not provide a PDF file.');
export const AccessDeniedError = Err('AccessDeniedError', ForbiddenError, 'Access denied.');
export const CsrfTokenError = Err('CsrfTokenError', ForbiddenError, 'CsrfTokenError');
export const InvalidOperationError = Err('InvalidOperationError', MethodNotAllowedError);
export const PermissionError = Err('PermissionError', ForbiddenError, "You don't have the required permission in this domain.");
export const PrivilegeError = Err('PrivilegeError', ForbiddenError, function (this: HydroError) {
    if (this.params.includes(global.Hydro.model.builtin.PRIV.PRIV_USER_PROFILE)) {
        return "You're not logged in.";
    }
    return "You don't have the required privilege.";
});
export const ValidationError = Err('ValidationError', ForbiddenError, function (this: HydroError) {
    if (this.params.length === 3) {
        return this.params[1]
            ? 'Field {0} or {1} validation failed. ({2})'
            : 'Field {0} validation failed. ({2})';
    }
    return this.params[1]
        ? 'Field {0} or {1} validation failed.'
        : 'Field {0} validation failed.';
});
