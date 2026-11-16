namespace NavdeckLink;

// The public NAVDECK service runs on the existing Oracle server, where the
// FastAPI backend and MongoDB share a private Docker network. Never point
// desktop credentials at the old Render/Atlas deployment.
internal static class CloudEndpoint
{
    public const string Origin = "https://test.navdeck.online";
}
