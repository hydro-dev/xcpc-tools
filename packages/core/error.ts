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

export const LoginError = Err('LoginError', ForbiddenError, 'Invalid password for user {0}.');
export const AccessDeniedError = Err('AccessDeniedError', ForbiddenError, 'Access denied.');
export const UserAlreadyExistError = Err('UserAlreadyExistError', ForbiddenError, 'User {0} already exists.');
export const InvalidTokenError = Err('InvalidTokenError', ForbiddenError, 'The {0} Token is invalid.');
export const BlacklistedError = Err('BlacklistedError', ForbiddenError, 'Address or user {0} is blacklisted.');
export const VerifyPasswordError = Err('VerifyPasswordError', ForbiddenError, "Passwords don't match.");
export const OpcountExceededError = Err('OpcountExceededError', ForbiddenError, 'Too frequent operations of {0} (limit: {2} operations in {1} seconds).');
export const PermissionError = Err('PermissionError', ForbiddenError, function (this: HydroError) {
    if (typeof this.params[0] === 'bigint') {
        this.params[0] = require('./model/builtin').PERMS.find(({ key }) => key === this.params[0])?.desc || this.params[0];
    }
    return "You don't have the required permission ({0}) in this domain.";
});
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
export const ContestNotLiveError = Err('ContestNotLiveError', ForbiddenError, 'This contest is not live.');
export const ContestNotEndedError = Err('ContestNotEndedError', ForbiddenError, 'This contest is not ended.');
export const ContestScoreboardHiddenError = Err('ContestScoreboardHiddenError', ForbiddenError, 'Contest scoreboard is not visible.');
export const CsrfTokenError = Err('CsrfTokenError', ForbiddenError, 'CsrfTokenError');
export const CurrentPasswordError = Err('CurrentPasswordError', ForbiddenError, "Current password doesn't match.");
export const FileLimitExceededError = Err('FileLimitExceededError', ForbiddenError, 'File {0} limit exceeded.');
export const FileUploadError = Err('FileUploadError', ForbiddenError, 'File upload failed.');
export const FileExistsError = Err('FileExistsError', ForbiddenError, 'File {0} already exists.');
export const AuthOperationError = Err('AuthOperationError', BadRequestError, '{0} is already {1}.');
export const UserNotFoundError = Err('UserNotFoundError', NotFoundError, 'User {0} not found.');
export const InvalidOperationError = Err('InvalidOperationError', MethodNotAllowedError);
export const FileTooLargeError = Err('FileTooLargeError', ValidationError, 'The uploaded file is too long.');
