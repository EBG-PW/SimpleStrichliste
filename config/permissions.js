/*
    app_permissions: List all permissions that are native to the application itself.
    All those permissions do not have a read or write part.
    However all those permissions need read & write to be true in order for a user to get them granted!
*/

module.exports = {
    "app_permissions": [
        "app.web.login",
        "app.web.logout"
    ],
    // The default groups are used for event/activity permissions. The code will check the inheritance tree until it hits one of the 2 default groups.
    "default_group": "user",
    "groups": {
        "app": {
            "permissions": [
                "app.web.login",
                "app.web.logout",
            ],
            "inherit": []
        },
        // The user group is the default group for all users. This group is granted to new users.
        "user": {
            "permissions": [
                "group.user",
                "web.user.*",
                "app.user.settings.*",
            ],
            "inherit": [
                "app"
            ]
        },
        // The admin group is the default group for administrators.
        "admin": {
            "permissions": [
                "web.admin.*",
            ],
            "inherit": [
                "user"
            ]
        },
        // The root group with general permissions.
        "root": {
            "permissions": [
                "*"
            ],
            "inherit": []
        }
    }
}