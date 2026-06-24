/*
    Define which errors should be logged to the console.
    Note, all errors will always be returned to the client.
*/
module.exports = {
    "log_errors": {
        "CustomError": true,
        "RenderError": true,
        "InvalidRouteInput": true,
        "InvalidRouteJson": true,
        "InvalidLogin": true,
        "RequestBlocked": false,
        "BlockedRequest": false,
        "Invalid2FA": false,
        "OAuthError": true,
        "DBError": true,
        "SQLError": true,
        "SQLDuplicateError": true,
        "InvalidToken": false,
        "TooManyRequests": false,
        "PurchaseError": false,
        "PermissionsError": true,
        "FilesystemError": true,
        "SqliteError": true,
        "ValidationError": true,
        "TypeError": true,
    }
}
