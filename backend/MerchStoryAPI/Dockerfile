# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy project files first for layer caching
COPY MerchStory.sln ./
COPY MerchStoryAPI/MerchStoryAPI.csproj MerchStoryAPI/
COPY MerchStoryImageGeneration/MerchStoryImageGeneration.csproj MerchStoryImageGeneration/

RUN dotnet restore MerchStoryAPI/MerchStoryAPI.csproj

# Copy all source and publish
COPY . .
RUN dotnet publish MerchStoryAPI/MerchStoryAPI.csproj -c Release -o /app/publish --no-restore

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

COPY --from=build /app/publish .

EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

ENTRYPOINT ["dotnet", "MerchStoryAPI.dll"]
