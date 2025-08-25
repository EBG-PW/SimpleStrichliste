/*
    Define which errors should be logged to the console.
    Note, all errors will always be returned to the client.
*/
module.exports = {
    "log_errors": {
        "CustomError": true,
        "RenderError": true,
        "TooManyRequests": false,
        "InvalidToken": false,
        "Invalid2FA": false,
        "InvalidLogin": true,
        "InvalidRouteInput": true,
        "PermissionsError": true,
        "FilesystemError": true,
        "OAuthError": true,
        "SqliteError": true,
        "DBError": true,
        "ValidationError": true,
        "TypeError": true,
    }
}