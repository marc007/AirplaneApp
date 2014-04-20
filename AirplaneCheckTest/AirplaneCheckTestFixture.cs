using System;
using NUnit.Framework;

using AirplaneCheck;
using System.IO;

namespace AirplaneCheckTest
{
	[TestFixture]
	public class AirplaneCheckTestFixture
	{
		IAirplaneDataService _AirplaneService;

		[SetUp]
		public void Setup ()
		{
			string storagePath = Environment.GetFolderPath (Environment.SpecialFolder.MyDocuments);
			_AirplaneService = new AirplaneDataService (storagePath);

			foreach(string filename in Directory.EnumerateFiles(storagePath, "*.json")) {
				File.Delete (filename);
			}
		}

		[Test]
		public void CreateAirPlaneInfo() {
			AirplaneInfo newAirplaneInfo = new AirplaneInfo ();
			newAirplaneInfo.airplanenumber = "NXXXX";
			newAirplaneInfo.model = "ModelX";
			newAirplaneInfo.airWorthDate = DateTime.Today;
			newAirplaneInfo.statusCode = "V";
			_AirplaneService.SaveAirplaneInfo (newAirplaneInfo);
		
			int testID = newAirplaneInfo.id.Value;

			_AirplaneService.RefreshCache ();

			AirplaneInfo SavedAirplaneInfo = _AirplaneService.GetAirplaneInfo (testID);
			Assert.NotNull (SavedAirplaneInfo);
			Assert.AreEqual (SavedAirplaneInfo.airplanenumber, "NXXXX");
		}

		[Test]
		public void ClearCache() {
			AirplaneInfo newAirplaneInfo = new AirplaneInfo ();
			newAirplaneInfo.airplanenumber = "NAAAA";
			newAirplaneInfo.model = "ModelA";
			newAirplaneInfo.airWorthDate = DateTime.Today;
			newAirplaneInfo.statusCode = "V";
			_AirplaneService.SaveAirplaneInfo (newAirplaneInfo);

			int testID = newAirplaneInfo.id.Value;

			_AirplaneService.RefreshCache ();
			Assert.AreNotEqual (_AirplaneService.AirplaneInfos.Count, 0);

			_AirplaneService.ClearCache ();
			Assert.AreEqual (_AirplaneService.AirplaneInfos.Count, 0);
		}

		[Test]
		public void UpdateAirPlaneInfo() {
			AirplaneInfo newAirplaneInfo = new AirplaneInfo ();
			newAirplaneInfo.airplanenumber = "NYYYY";
			newAirplaneInfo.model = "ModelY";
			newAirplaneInfo.airWorthDate = DateTime.Today;
			newAirplaneInfo.statusCode = "V";
			_AirplaneService.SaveAirplaneInfo (newAirplaneInfo);

			int testID = newAirplaneInfo.id.Value;

			_AirplaneService.RefreshCache ();

			AirplaneInfo SavedAirplaneInfo = _AirplaneService.GetAirplaneInfo (testID);
			SavedAirplaneInfo.model = "ModelZ";
			_AirplaneService.SaveAirplaneInfo (SavedAirplaneInfo);

			AirplaneInfo UpdatedAirplaneInfo = _AirplaneService.GetAirplaneInfo (testID);

			Assert.NotNull (UpdatedAirplaneInfo);
			Assert.AreEqual (UpdatedAirplaneInfo.model, "ModelZ");
		}

		[Test]
		public void DeleteAirPlaneInfo() {
			AirplaneInfo newAirplaneInfo = new AirplaneInfo ();
			newAirplaneInfo.airplanenumber = "NZZZZ";
			newAirplaneInfo.model = "ModelZ";
			newAirplaneInfo.airWorthDate = DateTime.Today;
			newAirplaneInfo.statusCode = "V";
			_AirplaneService.SaveAirplaneInfo (newAirplaneInfo);

			int testID = newAirplaneInfo.id.Value;

			_AirplaneService.RefreshCache ();

			AirplaneInfo SavedAirplaneInfo = _AirplaneService.GetAirplaneInfo (testID);
			Assert.IsNotNull (SavedAirplaneInfo);
			_AirplaneService.DeleteAirplaneInfo (SavedAirplaneInfo);

			_AirplaneService.RefreshCache ();

			AirplaneInfo DeletedAirplaneInfo = _AirplaneService.GetAirplaneInfo (testID);
			Assert.IsNull (DeletedAirplaneInfo);
		}

		[TearDown]
		public void Tear ()
		{
			string storagePath = Environment.GetFolderPath (Environment.SpecialFolder.MyDocuments);
			_AirplaneService = new AirplaneDataService (storagePath);

			foreach(string filename in Directory.EnumerateFiles(storagePath, "*.json")) {
				File.Delete (filename);
			}
		}
			
	}
}

